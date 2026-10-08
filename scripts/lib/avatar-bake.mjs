// Offline clothing fix for the Avaturn avatar (TASK-002). Pure functions over a glTF-Transform
// Document so they can be unit tested on a small fixture; scripts/bake-avatar-look.mjs does
// the file IO. The same transforms used to run in the browser (avatarLook.ts) and are now
// baked into public/avatar.glb once:
// 1. The shirt atlas (white islands on black padding) is dilated so bilinear and mip
//    sampling at island borders never pulls in black.
// 2. The shirt material becomes single sided, so cracks at the neck and seams cannot show
//    the inside of the collar.
// 3. Body and pants triangles whose three vertices lie under the shirt (a ray along the
//    vertex normal meets the shirt within a few centimetres) are removed. Coverage is
//    measured in the mesh node's world matrix, which is the skinned mesh bind matrix.
// 4. Body and neck vertices that stay under the shirt but lie closer to the shirt surface
//    than the TUCK margin (or outside it) are tucked inward along their normal, so no skin
//    triangle can reach through the shirt at the collar, sleeve openings and chest.
import jpeg from "jpeg-js";

export const BAKE_MARKER = "avatarLookBake";
export const BAKE_VERSION = 2;
export const SHIRT_MATERIAL = /^avaturn_look_1/;
/** Meshes whose covered triangles are removed (matched by mesh name or material name). */
export const HIDE_UNDER_SHIRT = /^(Body_Mesh|Head_Mesh|avaturn_look_0)/;
/**
 * Rings of triangles kept next to the uncovered area before covered triangles are removed.
 * The neck mesh keeps its first rings below the collar: removing them opens a see-through
 * slit at the collar rim in the neck silhouette, while the deeper chest part must go (its
 * triangles are what showed through the shirt as skin dots).
 */
export const HIDE_ERODE = { Head_Mesh: 1 };
/**
 * Skin meshes whose covered vertices are tucked under the shirt (pants are layered by lift).
 * margin: covered vertices are moved inward until they sit this far (metres) under the
 * shirt surface; max: a tuck never moves a vertex further than this. The neck is tucked only
 * slightly, because a deeper tuck narrows the visible neck and opens a see-through slit
 * between the neck silhouette and the collar rim.
 */
export const TUCK = {
  Body_Mesh: { margin: 0.004, max: 0.012 },
  Head_Mesh: { margin: 0.002, max: 0.003 },
};
/** A vertex is covered when its outward normal ray meets the shirt in [BEHIND, REACH] metres. */
export const COVER_REACH = 0.06;
export const COVER_BEHIND = -0.02;
/** Texels at or below this channel maximum count as empty padding. */
export const EMPTY_TEXEL_MAX = 24;
export const JPEG_QUALITY = 92;
/**
 * Layering replaces the former runtime polygon offset: the pants and the shirt are pushed
 * outward along welded vertex normals so body < pants < shirt wins the depth test where the
 * layers are nearly coincident (collar, sleeve openings, hem). Metres, in mesh node space.
 */
export const LAYER_LIFT = { avaturn_look_0: 0.0007, avaturn_look_1: 0.0015 };

/** True when the document carries the bake marker (so it must not be baked again). */
export function isBaked(doc) {
  const extras = doc.getRoot().getExtras();
  return Boolean(extras && extras[BAKE_MARKER]);
}

/**
 * Fills empty (near black) texels of an RGBA image by repeatedly copying the average of
 * their filled neighbours outward. Mutates and returns data; filled texels never change.
 */
export function dilateEmptyTexels(data, w, h, passes = 24) {
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    filled[i] = Math.max(data[o], data[o + 1], data[o + 2]) > EMPTY_TEXEL_MAX ? 1 : 0;
  }
  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!filled[j]) continue;
            r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++;
          }
        }
        if (n === 0) continue;
        data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; data[i * 4 + 3] = 255;
        next[i] = 1;
        changed = true;
      }
    }
    filled.set(next);
    if (!changed) break;
  }
  return data;
}

/** Decodes a JPEG, dilates its padding and re-encodes it. Returns the new bytes. */
export function dilateJpeg(bytes, quality = JPEG_QUALITY) {
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
  const data = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  dilateEmptyTexels(data, img.width, img.height);
  return new Uint8Array(jpeg.encode({ data: Buffer.from(img.data), width: img.width, height: img.height }, quality).data);
}

// ---- geometry -------------------------------------------------------------------------

function transformPoints(arr, m) {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

/** Inverse transpose of the upper 3x3 of a column-major 4x4, as a column-major 3x3. */
function normalMatrix(m) {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const s = Math.abs(det) < 1e-20 ? 1 : 1 / det;
  // inverse = adj / det; the normal matrix is its transpose
  return [
    A * s, B * s, C * s,
    (c * h - b * i) * s, (a * i - c * g) * s, (b * g - a * h) * s,
    (b * f - c * e) * s, (c * d - a * f) * s, (a * e - b * d) * s,
  ];
}

function transformNormals(arr, m) {
  const n = normalMatrix(m);
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    const nx = n[0] * x + n[3] * y + n[6] * z;
    const ny = n[1] * x + n[4] * y + n[7] * z;
    const nz = n[2] * x + n[5] * y + n[8] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[i] = nx / len; out[i + 1] = ny / len; out[i + 2] = nz / len;
  }
  return out;
}

/** Triangles of a primitive in the space of matrix m, as flat [a, e1, e2] float arrays. */
export function trianglesOf(prim, m) {
  const p = transformPoints(prim.getAttribute("POSITION").getArray(), m);
  const idx = prim.getIndices()?.getArray();
  const count = idx ? idx.length : p.length / 3;
  const tris = [];
  for (let i = 0; i < count; i += 3) {
    const ia = (idx ? idx[i] : i) * 3, ib = (idx ? idx[i + 1] : i + 1) * 3, ic = (idx ? idx[i + 2] : i + 2) * 3;
    tris.push([
      p[ia], p[ia + 1], p[ia + 2],
      p[ib] - p[ia], p[ib + 1] - p[ia + 1], p[ib + 2] - p[ia + 2],
      p[ic] - p[ia], p[ic + 1] - p[ia + 1], p[ic + 2] - p[ia + 2],
    ]);
  }
  return tris;
}

/** Moller-Trumbore, two sided; the signed distance along d, or null. */
function rayTri(ox, oy, oz, dx, dy, dz, t) {
  const [ax, ay, az, e1x, e1y, e1z, e2x, e2y, e2z] = t;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) / det;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) / det;
  if (v < 0 || u + v > 1) return null;
  return (e2x * qx + e2y * qy + e2z * qz) / det;
}

/**
 * Per vertex coverage by the shirt. Returns { covered, distance } where distance[v] is the
 * signed distance (metres) along the vertex normal to the nearest shirt hit, valid when
 * covered[v] is 1. A negative distance means the vertex lies outside the shirt surface.
 * m is the mesh node world matrix; null when the primitive has no normals.
 */
export function shirtCoverage(prim, m, shirtTris, { reach = COVER_REACH, behind = COVER_BEHIND } = {}) {
  const normal = prim.getAttribute("NORMAL");
  if (!normal) return null;
  const pos = transformPoints(prim.getAttribute("POSITION").getArray(), m);
  const nor = transformNormals(normal.getArray(), m);
  const vertexCount = pos.length / 3;
  const covered = new Uint8Array(vertexCount);
  const distance = new Float64Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 3;
    let best = null;
    for (const t of shirtTris) {
      const d = rayTri(pos[o], pos[o + 1], pos[o + 2], nor[o], nor[o + 1], nor[o + 2], t);
      if (d !== null && d >= behind && d <= reach && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best !== null) { covered[v] = 1; distance[v] = best; }
  }
  return { covered, distance };
}

/**
 * The index list without the triangles whose three vertices are all covered, or null when
 * none is. With erode > 0 a vertex only counts as covered when it is covered after `erode`
 * rounds of dropping every vertex that shares a triangle with an uncovered one.
 */
export function visibleIndexFromCoverage(prim, coveredIn, erode = 0) {
  const idx = prim.getIndices()?.getArray();
  const count = idx ? idx.length : coveredIn.length;
  let covered = coveredIn;
  if (erode > 0) {
    const pos = prim.getAttribute("POSITION").getArray();
    const key = (v) => `${Math.round(pos[v * 3] * 1e5)},${Math.round(pos[v * 3 + 1] * 1e5)},${Math.round(pos[v * 3 + 2] * 1e5)}`;
    // vertices that share a position (UV splits) count as one
    const keys = new Array(coveredIn.length);
    for (let v = 0; v < coveredIn.length; v++) keys[v] = key(v);
    const alive = new Map();
    for (let v = 0; v < coveredIn.length; v++) alive.set(keys[v], (alive.get(keys[v]) ?? true) && Boolean(coveredIn[v]));
    for (let r = 0; r < erode; r++) {
      const drop = new Set();
      for (let i = 0; i < count; i += 3) {
        const ks = [0, 1, 2].map((k) => keys[idx ? idx[i + k] : i + k]);
        if (ks.some((k) => !alive.get(k))) ks.forEach((k) => drop.add(k));
      }
      for (const k of drop) alive.set(k, false);
    }
    covered = new Uint8Array(coveredIn.length);
    for (let v = 0; v < coveredIn.length; v++) covered[v] = alive.get(keys[v]) ? 1 : 0;
  }
  const kept = [];
  for (let i = 0; i < count; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    if (!(covered[a] && covered[b] && covered[c])) kept.push(a, b, c);
  }
  return kept.length === count ? null : kept;
}

/**
 * The primitive's triangle index list without the triangles all three of whose vertices are
 * covered by the shirt, or null when nothing is covered.
 */
export function visibleIndexUnderShirt(prim, m, shirtTris, opts) {
  const cov = shirtCoverage(prim, m, shirtTris, opts);
  return cov ? visibleIndexFromCoverage(prim, cov.covered) : null;
}

/**
 * Tucks covered vertices inward along their normal until they are at least `margin` under
 * the shirt surface, never moving one further than `max`. Vertices that share a position
 * (UV or normal splits) move together so seams stay closed. Mutates POSITION and returns
 * the number of moved vertices. cov comes from shirtCoverage; m is the mesh world matrix.
 */
export function tuckUnderShirt(prim, m, cov, { margin = TUCK.Body_Mesh.margin, max = TUCK.Body_Mesh.max } = {}) {
  const posAcc = prim.getAttribute("POSITION");
  const nor = prim.getAttribute("NORMAL")?.getArray();
  if (!nor || !cov) return 0;
  const pos = posAcc.getArray();
  // local to world length ratio along the normal, so the amount is in world metres
  const ratio = (i) => {
    const x = nor[i], y = nor[i + 1], z = nor[i + 2];
    const l = Math.hypot(x, y, z) || 1;
    const wx = m[0] * x + m[4] * y + m[8] * z, wy = m[1] * x + m[5] * y + m[9] * z, wz = m[2] * x + m[6] * y + m[10] * z;
    return Math.hypot(wx, wy, wz) / l || 1;
  };
  const key = (i) => `${Math.round(pos[i] * 1e5)},${Math.round(pos[i + 1] * 1e5)},${Math.round(pos[i + 2] * 1e5)}`;
  // one shift per position: the largest requested by any vertex there
  const shifts = new Map();
  for (let v = 0; v < cov.covered.length; v++) {
    if (!cov.covered[v]) continue;
    const want = Math.min(max, margin - cov.distance[v]);
    if (want <= 0) continue;
    const k = key(v * 3);
    if (!(shifts.get(k) >= want)) shifts.set(k, want);
  }
  const sums = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    if (!shifts.has(k)) continue;
    const s = sums.get(k) ?? [0, 0, 0];
    s[0] += nor[i]; s[1] += nor[i + 1]; s[2] += nor[i + 2];
    sums.set(k, s);
  }
  const out = Float32Array.from(pos);
  let moved = 0;
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    const s = sums.get(k);
    if (!s) continue;
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    const amount = shifts.get(k) / ratio(i);
    out[i] -= (s[0] / len) * amount; out[i + 1] -= (s[1] / len) * amount; out[i + 2] -= (s[2] / len) * amount;
    moved++;
  }
  posAcc.setArray(out);
  return moved;
}

/**
 * Moves each vertex of a primitive outward along its normal, averaged over vertices that
 * share a position (so seams and UV splits stay closed). Mutates the POSITION accessor.
 */
export function liftAlongNormals(prim, lift) {
  const posAcc = prim.getAttribute("POSITION");
  const nor = prim.getAttribute("NORMAL")?.getArray();
  if (!nor) return;
  const pos = posAcc.getArray();
  const key = (i) => `${Math.round(pos[i] * 1e5)},${Math.round(pos[i + 1] * 1e5)},${Math.round(pos[i + 2] * 1e5)}`;
  const sums = new Map();
  for (let i = 0; i < pos.length; i += 3) {
    const k = key(i);
    const s = sums.get(k) ?? [0, 0, 0];
    s[0] += nor[i]; s[1] += nor[i + 1]; s[2] += nor[i + 2];
    sums.set(k, s);
  }
  const out = Float32Array.from(pos);
  for (let i = 0; i < pos.length; i += 3) {
    const s = sums.get(key(i));
    const len = Math.hypot(s[0], s[1], s[2]) || 1;
    out[i] += (s[0] / len) * lift; out[i + 1] += (s[1] / len) * lift; out[i + 2] += (s[2] / len) * lift;
  }
  posAcc.setArray(out);
}

// ---- document transform ----------------------------------------------------------------

/**
 * Applies the four transforms to a glTF-Transform Document in place and sets the bake
 * marker. Throws when the document is already baked. Returns counts for logging.
 */
export function bakeAvatarLook(doc, { dilate = dilateJpeg } = {}) {
  if (isBaked(doc)) throw new Error("avatar is already baked (marker present); bake from the recorded original");
  const root = doc.getRoot();
  const shirtNodes = root.listNodes().filter((n) => {
    const prims = n.getMesh()?.listPrimitives() ?? [];
    return prims.some((p) => SHIRT_MATERIAL.test(p.getMaterial()?.getName() ?? ""));
  });
  if (shirtNodes.length === 0) throw new Error("no shirt mesh (material avaturn_look_1*) found");

  const stats = { removedTriangles: {}, tuckedVertices: {}, shirtTextures: 0, singleSided: 0 };

  // 3. covered triangles (measured against the original shirt geometry)
  const shirtTris = shirtNodes.flatMap((n) =>
    n.getMesh().listPrimitives().flatMap((p) => trianglesOf(p, n.getWorldMatrix())),
  );
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || shirtNodes.includes(node)) continue;
    for (const prim of mesh.listPrimitives()) {
      const matName = prim.getMaterial()?.getName() ?? "";
      const hide = HIDE_UNDER_SHIRT.test(mesh.getName()) || HIDE_UNDER_SHIRT.test(node.getName()) || HIDE_UNDER_SHIRT.test(matName);
      const tuck = TUCK[mesh.getName()];
      if (!hide && !tuck) continue;
      const m = node.getWorldMatrix();
      const cov = shirtCoverage(prim, m, shirtTris);
      if (!cov) continue;
      const kept = hide ? visibleIndexFromCoverage(prim, cov.covered, HIDE_ERODE[mesh.getName()] ?? 0) : null;
      if (tuck) {
        const moved = tuckUnderShirt(prim, m, cov, tuck);
        if (moved) stats.tuckedVertices[mesh.getName()] = moved;
      }
      if (!kept) continue;
      const old = prim.getIndices();
      const before = old ? old.getCount() : prim.getAttribute("POSITION").getCount();
      const type = old ? old.getComponentType() : undefined;
      const array = type === 5125 || !old ? new Uint32Array(kept) : new Uint16Array(kept);
      const accessor = doc.createAccessor().setType("SCALAR").setArray(array).setBuffer(root.listBuffers()[0]);
      prim.setIndices(accessor);
      if (old && old.listParents().filter((p) => p.propertyType !== "Root").length === 0) old.dispose();
      stats.removedTriangles[mesh.getName()] = (before - kept.length) / 3;
    }
  }

  // 1 and 2. shirt material: padded texture, front faces only
  const seen = new Set();
  for (const node of shirtNodes) {
    for (const prim of node.getMesh().listPrimitives()) {
      const mat = prim.getMaterial();
      if (!mat || !SHIRT_MATERIAL.test(mat.getName()) || seen.has(mat)) continue;
      seen.add(mat);
      if (mat.getDoubleSided()) { mat.setDoubleSided(false); stats.singleSided++; }
      const tex = mat.getBaseColorTexture();
      if (!tex) continue;
      const sharedWithOthers = tex.listParents().some((p) => p.propertyType === "Material" && p !== mat);
      const target = sharedWithOthers ? tex.clone().setName(tex.getName() + "_padded") : tex;
      if (sharedWithOthers) mat.setBaseColorTexture(target);
      if (tex.getMimeType() !== "image/jpeg") throw new Error("shirt texture is not a JPEG: " + tex.getMimeType());
      target.setImage(dilate(tex.getImage()));
      stats.shirtTextures++;
    }
  }

  // layering (after coverage was measured on the original geometry)
  for (const node of root.listNodes()) {
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const name = prim.getMaterial()?.getName() ?? "";
      const key = Object.keys(LAYER_LIFT).find((k) => name.startsWith(k));
      if (key) liftAlongNormals(prim, LAYER_LIFT[key]);
    }
  }

  doc.getRoot().setExtras({ ...(root.getExtras() ?? {}), [BAKE_MARKER]: { version: BAKE_VERSION } });
  return stats;
}
