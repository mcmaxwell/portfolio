// The dusk sky dome (visual pass): a gradient from the fog colour at the horizon up to deep navy,
// an afterglow band, a far ridge silhouette and a few stars, in one fragment shader. The dome is
// drawn with depth test on and depth write off, never fogged, and follows the camera, so it sits
// behind everything. Colours are display (sRGB) values; the horizon equals the fog colour, so the
// far ground melts into the sky with no seam.
import * as THREE from "three";

export const SKY = {
  horizon: "#27364a",
  mid: "#1b2a44",
  zenith: "#080d1c",
  glow: "#d9825a",
  ridge: "#141f2e",
} as const;

const rgb = (hex: string) => {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
};

const vertexShader = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform float uOpacity;
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uGlow;
uniform vec3 uRidge;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  float h = clamp(e, 0.0, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZenith, smoothstep(0.12, 0.75, h));
  float az = atan(d.x, d.z);
  // Afterglow: a warm band hugging the horizon, strongest ahead and to the left of the spawn view.
  float ahead = 0.5 + 0.5 * cos(az - 0.45);
  float band = exp(-max(e, 0.0) * 9.0) * smoothstep(0.0, 0.05, e);
  col += uGlow * band * (0.1 + 0.34 * ahead * ahead);
  // Far ridge silhouette.
  float ridge = 0.03 + 0.022 * sin(az * 3.0 + 1.0) + 0.014 * sin(az * 7.0 + 2.0) + 0.007 * sin(az * 17.0 + 0.5);
  float mask = 1.0 - smoothstep(ridge - 0.003, ridge, e);
  vec3 rc = mix(uHorizon * 0.95, uRidge, smoothstep(-0.02, 0.025, e));
  col = mix(col, rc, mask * 0.94);
  // Stars.
  vec2 g = vec2(az * 55.0, e * 55.0);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 jit = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
  float star = step(0.987, hash(id)) * smoothstep(0.16, 0.0, length(f - jit * 0.6));
  col += star * smoothstep(0.22, 0.5, e) * 0.75;
  if (e < 0.0) col = uHorizon * 0.85;
  gl_FragColor = vec4(col, uOpacity);
}`;

export function createSky(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uOpacity: { value: 1 },
      uHorizon: { value: rgb(SKY.horizon) },
      uMid: { value: rgb(SKY.mid) },
      uZenith: { value: rgb(SKY.zenith) },
      uGlow: { value: rgb(SKY.glow) },
      uRidge: { value: rgb(SKY.ridge) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = "sky";
  return { mesh, material };
}
