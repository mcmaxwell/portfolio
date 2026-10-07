// World materials (visual pass). One MeshStandardMaterial per surface type, all sampling their
// procedural texture in world space (triplanar), so a surface keeps the same texel density
// whatever the block size or rotation, and every instance of a batch shares one draw call.
// Every material is "transparent" with opacity 1 once revealed (see the REVEALABLE note in
// resources.ts); `userData.base` is the opacity at full reveal.
import * as THREE from "three";
import { css, hex, mix, rng, type TexName } from "./textures";

export type MaterialSet = {
  get(key: string): THREE.Material;
  all: THREE.Material[];
  screens: Record<string, THREE.Material>;
};

const REVEALABLE = { transparent: true, opacity: 1 } as const;

type Tri = { tex: TexName; tile: number; color: string; rough: number; metal?: number; macro?: number; side?: TexName; anti?: boolean };

const TRI: Record<string, Tri> = {
  grass: { tex: "grass", tile: 1 / 4, color: "#ffffff", rough: 1, macro: 0.3, side: "cliff" },
  path: { tex: "gravel", tile: 1 / 2.4, color: "#ffffff", rough: 1 },
  paving: { tex: "paving", tile: 1 / 3, color: "#ffffff", rough: 0.85 },
  wall: { tex: "plaster", tile: 1 / 2.4, color: "#ffffff", rough: 0.92, macro: 0.3, anti: true },
  stone: { tex: "ashlar", tile: 1 / 2.4, color: "#ffffff", rough: 0.95, macro: 0.25, anti: true },
  roof: { tex: "standing", tile: 1 / 2, color: "#ffffff", rough: 0.55, metal: 0.25 },
  steel: { tex: "steel", tile: 1 / 1.6, color: "#ffffff", rough: 0.5, metal: 0.25 },
  trim: { tex: "steel", tile: 1 / 1.6, color: "#6f7b80", rough: 0.6, metal: 0.2 },
  pole: { tex: "steel", tile: 1 / 1.6, color: "#58656a", rough: 0.55, metal: 0.25 },
  curb: { tex: "ashlar", tile: 1 / 2.4, color: "#d3dad6", rough: 0.95 },
  wood: { tex: "planks", tile: 1 / 1, color: "#ffffff", rough: 0.85 },
  floor: { tex: "floor", tile: 1 / 3, color: "#ffffff", rough: 0.4, metal: 0.1, macro: 0.2, anti: true },
  leaves: { tex: "leaves", tile: 1 / 1.6, color: "#ffffff", rough: 1 },
  hedge: { tex: "leaves", tile: 1 / 1.6, color: "#d9e6d5", rough: 1 },
  bark: { tex: "bark", tile: 1 / 1, color: "#ffffff", rough: 1 },
  rock: { tex: "gravel", tile: 1 / 1.6, color: "#b8b8b0", rough: 1 },
};

/** Materials that are lit by the world but whose surface is a light source: colour, strength. */
const GLOW: Record<string, { color: string; base: string; strength: number }> = {
  "neon-cyan": { color: "#18c2e6", base: "#07181c", strength: 0.6 },
  "neon-green": { color: "#1fe07e", base: "#07180f", strength: 0.6 },
  "lamp-glow": { color: "#ff9f45", base: "#2a1d10", strength: 0.9 },
  "panel-light": { color: "#d6f2ec", base: "#1a2422", strength: 0.85 },
};

function triplanar(m: THREE.MeshStandardMaterial, tile: number, macro: number, side: THREE.Texture | undefined, anti: boolean) {
  if (side) m.defines = { ...(m.defines ?? {}), TRI_SIDE: "" };
  if (anti) m.defines = { ...(m.defines ?? {}), TRI_ANTI: "" };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: tile };
    shader.uniforms.uMacro = { value: macro };
    if (side) shader.uniforms.uSide = { value: side };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPos;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 triW = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          triW = instanceMatrix * triW;
        #endif
        vTriPos = ( modelMatrix * triW ).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vTriPos;
        uniform float uTile;
        uniform float uMacro;
        #ifdef TRI_SIDE
          uniform sampler2D uSide;
        #endif`
      )
      .replace(
        "#include <map_fragment>",
        `vec3 triN = abs( inverseTransformDirection( normalize( vNormal ), viewMatrix ) );
        vec3 triB = pow( triN, vec3( 6.0 ) );
        triB /= ( triB.x + triB.y + triB.z );
        vec3 triP = vTriPos * uTile;
        vec4 triS;
        #ifdef TRI_SIDE
          vec4 triTop = texture2D( map, triP.xz );
          vec4 triSide = ( texture2D( uSide, triP.zy ) * triB.x + texture2D( uSide, triP.xy ) * triB.z ) / max( triB.x + triB.z, 0.0001 );
          triS = mix( triSide, triTop, smoothstep( 0.5, 0.8, triN.y ) );
        #else
          triS = texture2D( map, triP.zy ) * triB.x + texture2D( map, triP.xz ) * triB.y + texture2D( map, triP.xy ) * triB.z;
        #endif
        #ifdef TRI_ANTI
          // Tile breaking: the same texture again at an unrelated scale and a turned axis, as a gentle
          // brightness modulation, so no stain or seam repeats at the base period.
          mat2 triR = mat2( 0.8253, -0.5646, 0.5646, 0.8253 );
          vec3 triQ = triP * 0.371 + vec3( 0.31, 0.17, 0.53 );
          vec3 triS2 = ( texture2D( map, triR * triQ.zy ).rgb * triB.x + texture2D( map, triR * triQ.xz ).rgb * triB.y + texture2D( map, triR * triQ.xy ).rgb * triB.z );
          float triL2 = dot( triS2, vec3( 0.3333 ) );
          triS.rgb *= mix( 0.74, 1.26, smoothstep( 0.18, 0.62, triL2 ) );
        #endif
        float triM = sin( vTriPos.x * 0.19 + sin( vTriPos.z * 0.11 ) * 2.0 ) * sin( vTriPos.z * 0.15 + sin( vTriPos.x * 0.09 ) * 2.0 );
        diffuseColor.rgb *= triS.rgb * ( 1.0 + uMacro * triM );`
      );
  };
  if (side) m.userData.extraMaps = [side];
  m.customProgramCacheKey = () => `world-tri${side ? "-side" : ""}${anti ? "-anti" : ""}`;
}

/**
 * Lit installations: a neon tube or a ceiling light panel is not one flat colour. The fragment knows
 * where it is on its box (local position, scaled by the instance size), so the emission can fall off
 * toward the edges of the face, dim at module seams along a long strip, fade at the ends, and (for a
 * panel) sit behind a dark bezel with fine louvre lines. Pure shader work: no extra draw call, and the
 * boxes themselves are untouched.
 */
function lit(m: THREE.MeshStandardMaterial, panel: boolean) {
  m.defines = { ...(m.defines ?? {}), ...(panel ? { LIT_PANEL: "" } : {}) };
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLitP;\nvarying vec3 vLitN;\nvarying vec3 vLitL;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vLitP = position;
        vLitN = normal;
        vLitL = vec3( 1.0 );
        #ifdef USE_INSTANCING
          vLitL = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
        #endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLitP;\nvarying vec3 vLitN;\nvarying vec3 vLitL;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 lL = max( vLitL, vec3( 0.001 ) );
          vec3 lq = vLitP * lL;
          vec3 lh = 0.5 * lL;
          vec3 lN = abs( vLitN );
          // Half sizes in the plane of this face (the normal axis is pushed out of every minimum).
          vec3 lf = lh + lN * 1000.0;
          float lShort = min( lf.x, min( lf.y, lf.z ) );
          float lEdge = min( lf.x - abs( lq.x ), min( lf.y - abs( lq.y ), lf.z - abs( lq.z ) ) );
          float lAcross = ( lf.x <= lf.y && lf.x <= lf.z ) ? lq.x : ( lf.y <= lf.z ? lq.y : lq.z );
          #ifdef LIT_PANEL
            float lBezel = smoothstep( 0.0, 0.05, lEdge );
            float lGlow = smoothstep( 0.0, max( lShort * 1.1, 0.02 ), lEdge );
            float lLines = 0.9 + 0.1 * cos( lAcross * 62.83 );
            totalEmissiveRadiance *= mix( 0.06, 1.0, lBezel ) * ( 0.5 + 0.5 * lGlow * lGlow ) * lLines;
          #else
            float lLong = max( lL.x, max( lL.y, lL.z ) );
            float lAlong = ( lL.x >= lL.y && lL.x >= lL.z ) ? lq.x : ( lL.y >= lL.z ? lq.y : lq.z );
            float lCore = smoothstep( 0.0, max( lShort * 0.95, 0.01 ), lEdge );
            float lSeam = abs( fract( lAlong / 0.6 + 0.5 ) - 0.5 ) * 2.0;
            float lSegs = 1.0 - 0.55 * smoothstep( 0.78, 1.0, lSeam ) * smoothstep( 0.9, 1.5, lLong );
            totalEmissiveRadiance *= mix( 0.4, 1.0, lCore ) * lSegs;
          #endif
        }`
      );
  };
  m.customProgramCacheKey = () => (panel ? "world-lit-panel" : "world-lit");
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A lit window: dark glass, a soft glow from the bottom, a reflection streak. */
function windowCanvas(accent: "cyan" | "green"): HTMLCanvasElement {
  const top = accent === "cyan" ? "#0a2a34" : "#0a2e1e";
  const bot = accent === "cyan" ? "#2a8da0" : "#27a06a";
  return canvas(128, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.beginPath();
    g.moveTo(10, 128);
    g.lineTo(46, 0);
    g.lineTo(64, 0);
    g.lineTo(28, 128);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(70, 70, 22, 58);
    g.fillRect(96, 84, 16, 44);
  });
}

const SCREEN_ACCENT = { cyan: "#35d0e8", green: "#2fe58a" } as const;
const SCREEN_LABEL: Record<string, string> = {
  xecsuite: "XECSUITE",
  newsstocks: "NEWSSTOCKS.LIVE",
  apex: "APEX MIND",
  skills: "SKILLS",
  experience: "EXPERIENCE",
  contact: "CONTACT",
};

/** A display wall: dark panel, accent title bar, a few code-like rows, a cursor. */
function screenCanvas(label: string, accent: "cyan" | "green"): HTMLCanvasElement {
  const col = SCREEN_ACCENT[accent];
  const c = hex(col);
  return canvas(512, 308, (g) => {
    g.fillStyle = "#03100c";
    g.fillRect(0, 0, 512, 308);
    const grad = g.createLinearGradient(0, 0, 0, 308);
    grad.addColorStop(0, css(c, 0.16));
    grad.addColorStop(1, css(c, 0.02));
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 308);
    g.strokeStyle = col;
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 302);
    g.fillStyle = css(c, 0.2);
    g.fillRect(6, 6, 500, 70);
    g.font = '700 44px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
    g.textBaseline = "middle";
    let size = 44;
    while (g.measureText(label).width > 460 && size > 20) {
      size -= 2;
      g.font = `700 ${size}px "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace`;
    }
    g.fillStyle = col;
    g.fillText(label, 26, 42);
    const r = rng(label.length * 977 + label.charCodeAt(0));
    for (let i = 0; i < 6; i++) {
      const w = 80 + r() * 300;
      g.fillStyle = css(mix(c, [255, 255, 255], i % 3 === 0 ? 0.35 : 0), i % 3 === 0 ? 0.85 : 0.5);
      g.fillRect(30 + (i % 2) * 24, 106 + i * 30, w, 12);
    }
    g.fillStyle = col;
    g.fillRect(30, 106 + 6 * 30, 14, 20);
  });
}

function padCanvases(): { base: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const draw = (lines: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = lines ? "#000000" : "#0c1a1e";
    g.fillRect(0, 0, 512, 512);
    if (!lines) {
      g.strokeStyle = "rgba(53,208,232,0.10)";
      g.lineWidth = 1;
      for (let i = 0; i <= 512; i += 64) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i, 512);
        g.moveTo(0, i);
        g.lineTo(512, i);
        g.stroke();
      }
      return;
    }
    g.strokeStyle = "#35d0e8";
    g.lineWidth = 12;
    g.strokeRect(14, 14, 484, 484);
    g.lineWidth = 7;
    g.beginPath();
    g.arc(256, 256, 190, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(256, 256, 150, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 10;
    for (const [x, y, dx, dy] of [[40, 40, 1, 1], [472, 40, -1, 1], [40, 472, 1, -1], [472, 472, -1, -1]] as const) {
      g.beginPath();
      g.moveTo(x + dx * 46, y);
      g.lineTo(x, y);
      g.lineTo(x, y + dy * 46);
      g.stroke();
    }
  };
  return { base: canvas(512, 512, draw(false)), glow: canvas(512, 512, draw(true)) };
}

function gradientCanvas(kind: "soft" | "ring"): HTMLCanvasElement {
  return canvas(256, 256, (g) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, 256, 256);
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    if (kind === "soft") {
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.35, "rgba(255,255,255,0.45)");
      r.addColorStop(0.7, "rgba(255,255,255,0.12)");
      r.addColorStop(1, "rgba(255,255,255,0)");
    } else {
      r.addColorStop(0, "rgba(255,255,255,0)");
      r.addColorStop(0.55, "rgba(255,255,255,0)");
      r.addColorStop(0.6, "rgba(255,255,255,0.7)");
      r.addColorStop(0.63, "rgba(255,255,255,0.15)");
      r.addColorStop(0.7, "rgba(255,255,255,0)");
      r.addColorStop(0.8, "rgba(255,255,255,0)");
      r.addColorStop(0.83, "rgba(255,255,255,0.35)");
      r.addColorStop(0.86, "rgba(255,255,255,0)");
      r.addColorStop(1, "rgba(255,255,255,0)");
    }
    g.fillStyle = r;
    g.fillRect(0, 0, 256, 256);
  });
}

const FIXED_KEYS = ["glass-cyan", "glass-green", "pad", "decal-cyan", "decal-green", "decal-warm", "decal-white", "ring-cyan"];

/** True for every material key `createMaterials` registers (the keys are static, no DOM needed). */
export function isWorldMaterial(key: string): boolean {
  if (key.startsWith("screen:")) return key.slice(7) in SCREEN_LABEL;
  return key in TRI || key in GLOW || FIXED_KEYS.includes(key);
}

export function createMaterials(textures: Record<TexName, THREE.CanvasTexture>): MaterialSet {
  const all: THREE.Material[] = [];
  const map = new Map<string, THREE.Material>();
  const reg = <M extends THREE.Material>(key: string, m: M, base = 1): M => {
    m.userData.base = base;
    m.name = key;
    map.set(key, m);
    all.push(m);
    return m;
  };

  for (const [key, s] of Object.entries(TRI)) {
    const m = new THREE.MeshStandardMaterial({ map: textures[s.tex], color: s.color, roughness: s.rough, metalness: s.metal ?? 0, ...REVEALABLE });
    triplanar(m, s.tile, s.macro ?? 0, s.side ? textures[s.side] : undefined, s.anti === true);
    reg(key, m);
  }
  // Neon reads as a lit tube: the emission falls off toward every edge of a face.
  const edge = tex(
    canvas(64, 64, (g) => {
      const img = g.createImageData(64, 64);
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const f = Math.min(x + 0.5, 63.5 - x, y + 0.5, 63.5 - y) / 32;
          const t = Math.min(1, f / 0.55);
          const v = Math.round(255 * (0.5 + 0.5 * t * t * (3 - 2 * t)));
          const i = (y * 64 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }),
    false
  );
  for (const [key, g] of Object.entries(GLOW)) {
    const neon = key.startsWith("neon") || key === "lamp-glow";
    const m = new THREE.MeshStandardMaterial({ color: g.base, emissive: g.color, emissiveIntensity: g.strength * (neon ? 1.25 : 1), ...(neon ? { emissiveMap: edge } : {}), roughness: 0.6, ...REVEALABLE });
    lit(m, key === "panel-light");
    reg(key, m);
  }
  for (const accent of ["cyan", "green"] as const) {
    const t = tex(windowCanvas(accent));
    reg(`glass-${accent}`, new THREE.MeshStandardMaterial({ color: "#8aa0a4", map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.1, ...REVEALABLE }));
  }
  const pad = padCanvases();
  const padBase = tex(pad.base);
  const padGlow = tex(pad.glow);
  reg("pad", new THREE.MeshStandardMaterial({ color: "#ffffff", map: padBase, emissive: "#ffffff", emissiveMap: padGlow, emissiveIntensity: 0.95, roughness: 0.45, metalness: 0.2, ...REVEALABLE }));

  const screens: Record<string, THREE.Material> = {};
  for (const [id, label] of Object.entries(SCREEN_LABEL)) {
    const accent = id === "skills" || id === "experience" ? "green" : "cyan";
    const t = tex(screenCanvas(label, accent));
    screens[id] = reg(`screen:${id}`, new THREE.MeshStandardMaterial({ color: "#2a3430", map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.3, ...REVEALABLE }));
  }

  // Light pools and rings: additive, unlit, never write depth.
  const soft = tex(gradientCanvas("soft"), false);
  const ring = tex(gradientCanvas("ring"), false);
  const additive = (key: string, t: THREE.Texture, color: string, opacity: number) =>
    reg(
      key,
      new THREE.MeshBasicMaterial({
        map: t,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      opacity
    );
  additive("decal-cyan", soft, "#35d0e8", 0.2);
  additive("decal-green", soft, "#2fe58a", 0.2);
  additive("decal-white", soft, "#cfe6ff", 0.3);
  additive("decal-warm", soft, "#ffb470", 0.16);
  additive("ring-cyan", ring, "#35d0e8", 0.5);

  return {
    get(key) {
      const m = map.get(key);
      if (!m) throw new Error(`unknown world material ${key}`);
      return m;
    },
    all,
    screens,
  };
}
