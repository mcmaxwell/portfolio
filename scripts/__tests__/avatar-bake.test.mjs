import { Document } from "@gltf-transform/core";
import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import {
  BAKE_MARKER,
  bakeAvatarLook,
  dilateEmptyTexels,
  dilateJpeg,
  isBaked,
  liftAlongNormals,
  shirtCoverage,
  tuckUnderShirt,
  TUCK,
  visibleIndexUnderShirt,
  trianglesOf,
} from "../lib/avatar-bake.mjs";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A strip of `cells` unit quads in the plane z = z facing +z (two triangles per cell). */
function strip(doc, buffer, name, matName, z, x1, cells, texture) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= cells; i++) {
    const x = (x1 * i) / cells;
    pos.push(x, 0, z, x, 1, z);
    nor.push(0, 0, 1, 0, 0, 1);
    uv.push(0, 0, 0, 1);
  }
  for (let i = 0; i < cells; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const material = doc.createMaterial(matName).setDoubleSided(true);
  if (texture) material.setBaseColorTexture(texture);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nor)))
    .setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(uv)))
    .setIndices(acc("SCALAR", new Uint16Array(idx)))
    .setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  return doc.createNode(name).setMesh(mesh);
}

/** 16x16 RGBA: a white 8x8 island on black padding, encoded as JPEG. */
function islandJpeg() {
  const w = 16, data = Buffer.alloc(w * w * 4, 0);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, inside = x >= 4 && x < 12 && y >= 4 && y < 12;
    data[o] = data[o + 1] = data[o + 2] = inside ? 255 : 0;
    data[o + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: w }, 95).data);
}

function fixture() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture("shirt").setMimeType("image/jpeg").setImage(islandJpeg());
  const scene = doc.createScene();
  // Shirt spans x 0..2 at z = 0.01; the body strip spans x 0..4 at z = 0 (cells 0,1 covered).
  const shirt = strip(doc, buffer, "avaturn_look_1", "avaturn_look_1_material", 0.01, 2, 2, texture);
  const body = strip(doc, buffer, "Body_Mesh", "Body", 0, 4, 4);
  const eyes = strip(doc, buffer, "Eye_Mesh", "Eyes", 0, 4, 4);
  scene.addChild(shirt).addChild(body).addChild(eyes);
  return { doc, shirt, body, eyes, texture };
}

describe("dilateEmptyTexels", () => {
  it("fills near-black padding from filled neighbours and leaves filled texels alone", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
    dilateEmptyTexels(data, 4, 1, 4);
    expect(Array.from(data.slice(0, 3))).toEqual([255, 255, 255]);
    expect(Array.from(data.slice(8, 11))).toEqual([255, 255, 255]);
    expect(Array.from(data.slice(12, 15))).toEqual([255, 255, 255]);
  });

  it("leaves an all-empty image unchanged", () => {
    const data = new Uint8ClampedArray(16);
    dilateEmptyTexels(data, 2, 2);
    expect(Array.from(data)).toEqual(new Array(16).fill(0));
  });

  it("removes black padding from a JPEG island and is deterministic", () => {
    const src = islandJpeg();
    const out = dilateJpeg(src);
    expect(Array.from(dilateJpeg(src))).toEqual(Array.from(out));
    const img = jpeg.decode(out, { useTArray: true, formatAsRGBA: true });
    const corner = img.data[0];
    expect(corner).toBeGreaterThan(200);
  });
});

describe("covered triangle removal", () => {
  it("drops body triangles covered by the shirt and keeps the rest", () => {
    const { doc, body } = fixture();
    const stats = bakeAvatarLook(doc);
    const prim = body.getMesh().listPrimitives()[0];
    // 4 cells x 2 triangles = 8; the two covered cells (4 triangles) are dropped.
    expect(prim.getIndices().getCount() / 3).toBe(4);
    expect(Math.min(...prim.getIndices().getArray())).toBeGreaterThanOrEqual(4);
    expect(stats.removedTriangles.Body_Mesh).toBe(4);
  });

  it("leaves non-clothing meshes alone", () => {
    const { doc, eyes } = fixture();
    bakeAvatarLook(doc);
    expect(eyes.getMesh().listPrimitives()[0].getIndices().getCount() / 3).toBe(8);
  });

  it("keeps everything when nothing is covered", () => {
    const { doc, shirt } = fixture();
    const tris = trianglesOf(shirt.getMesh().listPrimitives()[0], [...IDENTITY.slice(0, 14), 5, 1]);
    const body = fixture().body.getMesh().listPrimitives()[0];
    expect(visibleIndexUnderShirt(body, IDENTITY, tris)).toBeNull();
    expect(doc).toBeTruthy();
  });
});

/** Fixture variant whose body strip sits at height z (the shirt stays at z = 0.01). */
function bodyAt(z, name = "Body_Mesh") {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const texture = doc.createTexture("shirt").setMimeType("image/jpeg").setImage(islandJpeg());
  const scene = doc.createScene();
  const shirt = strip(doc, buffer, "avaturn_look_1", "avaturn_look_1_material", 0.01, 2, 2, texture);
  const body = strip(doc, buffer, name, name === "Head_Mesh" ? "Head" : "Body", z, 4, 4);
  scene.addChild(shirt).addChild(body);
  return { doc, body };
}
const zs = (node) => Array.from(node.getMesh().listPrimitives()[0].getAttribute("POSITION").getArray()).filter((_, i) => i % 3 === 2);

describe("skin tuck under the shirt", () => {
  it("reports signed distance to the shirt for covered vertices only", () => {
    const { doc, body } = bodyAt(0.008);
    const shirt = doc.getRoot().listNodes().find((n) => n.getName() === "avaturn_look_1");
    const tris = trianglesOf(shirt.getMesh().listPrimitives()[0], IDENTITY);
    const cov = shirtCoverage(body.getMesh().listPrimitives()[0], IDENTITY, tris);
    expect(Array.from(cov.covered)).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(cov.distance[0]).toBeCloseTo(0.002, 6);
  });

  it("moves a vertex that is too close to the surface down to the margin", () => {
    const { doc, body } = bodyAt(0.008);
    const stats = bakeAvatarLook(doc);
    const z = zs(body);
    expect(z[0]).toBeCloseTo(0.01 - TUCK.Body_Mesh.margin, 6);
    expect(z[5]).toBeCloseTo(0.01 - TUCK.Body_Mesh.margin, 6);
    expect(z[8]).toBeCloseTo(0.008, 6); // uncovered vertices keep their place
    expect(stats.tuckedVertices.Body_Mesh).toBe(6);
  });

  it("pulls a vertex that pokes outside the shirt under it, limited to TUCK.Body_Mesh.max", () => {
    const outside = bodyAt(0.02); // 10 mm outside: wants 14 mm, capped at TUCK.Body_Mesh.max
    bakeAvatarLook(outside.doc);
    expect(zs(outside.body)[0]).toBeCloseTo(0.02 - TUCK.Body_Mesh.max, 6);
    const slight = bodyAt(0.012); // 2 mm outside: wants 6 mm
    bakeAvatarLook(slight.doc);
    expect(zs(slight.body)[0]).toBeCloseTo(0.012 - (TUCK.Body_Mesh.margin + 0.002), 6);
  });

  it("leaves vertices alone when they already sit deeper than the margin", () => {
    const { doc, body } = bodyAt(0);
    const stats = bakeAvatarLook(doc);
    expect(zs(body)[0]).toBeCloseTo(0, 6);
    expect(stats.tuckedVertices.Body_Mesh).toBeUndefined();
  });

  it("tucks the neck mesh and removes its covered triangles, but never touches the eyes", () => {
    const { doc, body } = bodyAt(0.0095, "Head_Mesh");
    const stats = bakeAvatarLook(doc);
    // the neck uses the gentler TUCK.Head_Mesh: 0.5 mm under the shirt wants 1.5 mm
    expect(zs(body)[0]).toBeCloseTo(0.0095 - (TUCK.Head_Mesh.margin - 0.0005), 6);
    expect(stats.tuckedVertices.Head_Mesh).toBe(6);
    // 2 covered cells (4 triangles); HIDE_ERODE keeps the ring next to the uncovered area
    expect(stats.removedTriangles.Head_Mesh).toBe(2);
    expect(body.getMesh().listPrimitives()[0].getIndices().getCount() / 3).toBe(6);
    const f = fixture();
    bakeAvatarLook(f.doc);
    expect(zs(f.eyes)).toEqual(Array.from({ length: 10 }, () => 0));
  });

  it("is a no-op without a coverage result or normals", () => {
    const { body } = bodyAt(0.008);
    expect(tuckUnderShirt(body.getMesh().listPrimitives()[0], IDENTITY, null)).toBe(0);
  });
});

describe("shirt material and layering", () => {
  it("makes the shirt single sided, pads its texture and keeps other materials double sided", () => {
    const { doc, shirt, body, texture } = fixture();
    const before = texture.getImage();
    bakeAvatarLook(doc);
    const mat = shirt.getMesh().listPrimitives()[0].getMaterial();
    expect(mat.getDoubleSided()).toBe(false);
    expect(mat.getBaseColorTexture().getImage()).not.toEqual(before);
    expect(body.getMesh().listPrimitives()[0].getMaterial().getDoubleSided()).toBe(true);
  });

  it("lifts along welded normals without opening seams", () => {
    const { doc, shirt } = fixture();
    const prim = shirt.getMesh().listPrimitives()[0];
    liftAlongNormals(prim, 0.002);
    const p = prim.getAttribute("POSITION").getArray();
    expect(p[2]).toBeCloseTo(0.012, 6);
    expect(p[0]).toBeCloseTo(0, 6);
    expect(doc).toBeTruthy();
  });
});

describe("idempotence guard", () => {
  it("marks the document and refuses to bake it again", () => {
    const { doc } = fixture();
    expect(isBaked(doc)).toBe(false);
    bakeAvatarLook(doc);
    expect(isBaked(doc)).toBe(true);
    expect(doc.getRoot().getExtras()[BAKE_MARKER]).toBeTruthy();
    const idx = Array.from(doc.getRoot().listMeshes()[1].listPrimitives()[0].getIndices().getArray());
    expect(() => bakeAvatarLook(doc)).toThrow(/already baked/);
    expect(Array.from(doc.getRoot().listMeshes()[1].listPrimitives()[0].getIndices().getArray())).toEqual(idx);
  });

  it("produces identical output from identical input", () => {
    const a = fixture(), b = fixture();
    bakeAvatarLook(a.doc); bakeAvatarLook(b.doc);
    const texA = a.shirt.getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture().getImage();
    const texB = b.shirt.getMesh().listPrimitives()[0].getMaterial().getBaseColorTexture().getImage();
    expect(Array.from(texA)).toEqual(Array.from(texB));
  });

  it("throws when there is no shirt", () => {
    const doc = new Document();
    expect(() => bakeAvatarLook(doc)).toThrow(/no shirt/);
  });
});
