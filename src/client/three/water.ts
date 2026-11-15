// The sea. One flat plane; all the detail is in the fragment shader:
// - swell and ripples as analytic waves plus noise, aligned with the wind
// - gusts are darker and rougher (cat's paws); lulls are smoother and paler
// - depth from a land-distance texture: deep blue -> teal -> turquoise -> sand, with caustics
// - shore foam that laps, sky reflection with Fresnel, and sun glints
import {
  Color,
  DataTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { type LandShape, SDF_RECT, SHOALS, landSdf } from './world';

export const MAX_PUFFS = 6;

export type WaterPalette = {
  deep: string;
  mid: string;
  shallow: string;
  sand: string;
  skyTop: string;
  skyHorizon: string;
};

export const TROPICAL: WaterPalette = {
  deep: '#0a4766',
  mid: '#0f7890',
  shallow: '#35c2b8',
  sand: '#d9cfa4',
  skyTop: '#5fa9d6',
  skyHorizon: '#d8ecf2',
};

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const frag = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec2 uWindTo;
uniform vec4 uPuffs[${MAX_PUFFS}];
uniform int uPuffCount;
uniform sampler2D uLand;
uniform vec4 uLandRect;
uniform vec3 uDeep, uMid, uShallow, uSand, uSkyTop, uSkyHorizon;
uniform float uGustShow;
uniform float uHaze;
uniform float uCaps;
varying vec3 vWorld;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
// Value noise with its analytic gradient (one lookup set instead of four).
vec2 noiseGrad(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Slope of one travelling wave: direction d (unit), wavelength L, amplitude A.
vec2 wave(vec2 p, vec2 d, float L, float A, float t) {
  float k = 6.2831853 / L;
  float c = sqrt(9.81 / k);
  return A * k * cos(k * (dot(d, p) - c * t)) * d;
}

void main() {
  vec2 p = vWorld.xz;
  float t = uTime;

  // Local wind factor from gusts and lulls (same falloff as the simulation).
  float g = 0.0;
  for (int i = 0; i < ${MAX_PUFFS}; i++) {
    if (i >= uPuffCount) break;
    vec4 pf = uPuffs[i];
    float d = length(p - pf.xy);
    // soften the edge a little for the eye; the core uses a linear falloff to the radius
    float f = 1.0 - smoothstep(pf.z * 0.15, pf.z, d);
    g += pf.w * f;
  }
  float gust = max(g, 0.0);
  float lull = max(-g, 0.0);

  // Land / depth
  vec2 uv = (vec2(p.x, -p.y) - uLandRect.xy) / uLandRect.z;
  vec4 land = texture2D(uLand, uv);
  float sdf = land.r * 72.0 - 8.0;        // metres to land, negative inside
  float depth = land.g;                    // 0 shallow .. 1 deep

  // Waves: long swell + wind waves, rotated to the wind, roughness from gusts.
  vec2 wd = normalize(uWindTo);
  float rough = 1.0 + 2.4 * gust * uGustShow - 0.65 * min(lull * 3.0, 1.0);
  float shoreCalm = smoothstep(0.0, 14.0, sdf);
  vec2 gr = vec2(0.0);
  gr += wave(p, normalize(vec2(0.86, 0.5)), 38.0, 0.16, t);
  gr += wave(p, normalize(vec2(0.7, 0.71)), 23.0, 0.09, t);
  gr += wave(p, rot(0.35) * wd, 9.0, 0.045 * rough, t);
  gr += wave(p, rot(-0.5) * wd, 6.2, 0.03 * rough, t);
  gr += wave(p, rot(0.9) * wd, 3.7, 0.016 * rough, t);
  gr += wave(p, rot(-1.1) * wd, 2.6, 0.012 * rough, t);
  // chop and cat's paws
  vec2 q = p * 0.42 + wd * t * 0.9;
  gr += noiseGrad(q) * 0.06 * rough;
  gr += noiseGrad(p * 1.3 - wd * t * 1.6 + 17.0) * 0.025 * rough * rough;
  gr *= mix(0.35, 1.0, shoreCalm);

  vec3 N = normalize(vec3(-gr.x, 1.0, -gr.y));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 R = reflect(-V, N);

  // Water body colour by depth; gusts read darker, lulls paler.
  vec3 body = mix(uMid, uDeep, smoothstep(0.35, 1.0, depth));
  body = mix(uShallow, body, smoothstep(0.08, 0.45, depth));
  // Sandy bottom showing through in the shallows, with moving caustics.
  float clear = 1.0 - smoothstep(0.0, 0.16, depth);
  if (clear > 0.001) {
    vec2 cq = p * 0.28 + vec2(t * 0.06, -t * 0.05);
    float caus = pow(1.0 - abs(noise(cq) * 2.0 - 1.0), 6.0) + pow(1.0 - abs(noise(cq * 1.7 + 9.0) * 2.0 - 1.0), 6.0);
    vec3 bottom = uSand * (0.82 + 0.35 * caus);
    body = mix(body, bottom, clear * 0.78);
  }
  body *= 1.0 - 0.28 * min(gust * 2.6, 1.0) * uGustShow;
  body = mix(body, body * 1.12 + 0.02, min(lull * 3.0, 1.0) * 0.6);

  // Sky reflection
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.45));
  vec3 col = mix(body, sky, fres);

  // Sun: a broad sheen from the swell, and glitter from tiny ripples (many small sparkles).
  float sd = max(dot(R, uSunDir), 0.0);
  col += vec3(1.0, 0.95, 0.84) * pow(sd, 40.0) * 0.16;
  vec2 mg = noiseGrad(p * 7.0 + wd * t * 2.4) * 0.8;
  vec3 Nm = normalize(vec3(-gr.x - mg.x * 0.35 * rough, 1.0, -gr.y - mg.y * 0.35 * rough));
  vec3 Rm = reflect(-V, Nm);
  float gl = pow(max(dot(Rm, uSunDir), 0.0), 700.0);
  col += vec3(1.0, 0.97, 0.9) * gl * 1.1 * smoothstep(0.1, 0.8, pow(sd, 10.0));

  // Gust texture: tiny glinting ripples so gusts read without colour alone.
  if (gust > 0.001) {
    float sparkle = smoothstep(0.82, 0.98, noise(p * 2.2 + wd * t * 3.0)) * gust * uGustShow;
    col += vec3(0.85, 0.92, 1.0) * sparkle * 0.18;
  }

  // Whitecaps: more in a stronger breeze, and many more inside gusts (they show where the wind is).
  float capAmt = uCaps + gust * 1.8 * uGustShow;
  if (capAmt > 0.01 && sdf > 6.0) {
    // Small streaks, long across the wind and thin along it, breaking and fading as they travel.
    vec2 perp = vec2(-wd.y, wd.x);
    vec2 wq = vec2(dot(p, perp) * 0.5, dot(p, wd) * 1.7 - t * 2.4);
    float crest = smoothstep(0.9 - min(capAmt, 1.0) * 0.05, 0.99, noise(wq));
    float breakup = smoothstep(0.38, 0.78, noise(p * 2.8 + wd * t * 1.3));
    float life = smoothstep(0.35, 0.75, noise(p * 0.06 + vec2(t * 0.11, -t * 0.07)));
    col = mix(col, vec3(0.94, 0.97, 0.98), crest * breakup * life * min(1.0, capAmt) * 0.85);
  }

  // Shore foam: a lapping band plus scattered foam just off the beach.
  if (sdf < 4.5) {
    float lap = 0.9 + 0.7 * sin(t * 1.15 - sdf * 1.4 + noise(p * 0.3) * 4.0);
    float foam = (1.0 - smoothstep(0.0, lap, sdf)) * smoothstep(-0.6, 0.15, sdf);
    foam += (1.0 - smoothstep(0.0, 4.0, sdf)) * smoothstep(0.62, 0.8, noise(p * 0.9 + t * 0.2)) * 0.6;
    col = mix(col, vec3(0.97, 0.98, 0.96), clamp(foam, 0.0, 1.0) * 0.92);
  }

  // Atmospheric haze with distance.
  float dist = length(cameraPosition.xz - vWorld.xz);
  col = mix(col, uSkyHorizon * 0.92, smoothstep(uHaze, uHaze + 520.0, dist) * 0.7);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type Water = {
  mesh: Mesh;
  material: ShaderMaterial;
  setPuffs(list: Array<{ x: number; y: number; r: number; k: number }>): void;
  update(time: number): void;
  setHaze(near: number): void;
};

/** Bake land distance (R) and depth (G) into a texture. */
function bakeLand(land: LandShape): DataTexture {
  const { x0, y0, size, res } = SDF_RECT;
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    // row j = north-south axis in course space (y)
    const y = y0 + ((j + 0.5) / res) * size;
    for (let i = 0; i < res; i++) {
      const x = x0 + ((i + 0.5) / res) * size;
      const d = landSdf(land, x, y);
      let depth = Math.min(1, Math.max(0, d / 55));
      depth = Math.pow(depth, 0.8);
      for (const s of SHOALS) {
        const k = Math.hypot(x - s.x, y - s.y) / s.r;
        if (k < 1) depth = Math.min(depth, 1 - (1 - s.depth) * (1 - k * k) * (1 - k * k) - 0) ;
      }
      // a little large-scale variation so the deep water is not flat
      depth = Math.min(1, depth * (0.92 + 0.08 * Math.sin(x * 0.013 + Math.cos(y * 0.011) * 2)));
      const o = (j * res + i) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, (d + 8) / 72)) * 255);
      data[o + 1] = Math.round(depth * 255);
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, res, res, RGBAFormat, UnsignedByteType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createWater(land: LandShape, windToRad: number, sunDir: Vector3, strength = 1, palette = TROPICAL): Water {
  const puffs = Array.from({ length: MAX_PUFFS }, () => new Vector4());
  const c = (h: string) => new Color(h);
  const material = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      // wind "to" direction in the xz plane (z is south)
      uWindTo: { value: new Vector2(Math.sin(windToRad), -Math.cos(windToRad)) },
      uPuffs: { value: puffs },
      uPuffCount: { value: 0 },
      uLand: { value: bakeLand(land) },
      uLandRect: { value: new Vector4(SDF_RECT.x0, SDF_RECT.y0, SDF_RECT.size, 0) },
      uDeep: { value: c(palette.deep) },
      uMid: { value: c(palette.mid) },
      uShallow: { value: c(palette.shallow) },
      uSand: { value: c(palette.sand) },
      uSkyTop: { value: c(palette.skyTop) },
      uSkyHorizon: { value: c(palette.skyHorizon) },
      uGustShow: { value: 1 },
      uHaze: { value: 130 },
      uCaps: { value: [0.0, 0.18, 0.45][strength] ?? 0.18 },
    },
  });
  const geo = new PlaneGeometry(2400, 2400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, material);
  mesh.position.set(200, 0, -200);
  mesh.renderOrder = -1;
  return {
    mesh,
    material,
    setPuffs(list) {
      const n = Math.min(list.length, MAX_PUFFS);
      for (let i = 0; i < n; i++) {
        const p = list[i]!;
        // xz centre (z = -y), radius, strength (k-1)
        puffs[i]!.set(p.x, -p.y, p.r, p.k - 1);
      }
      material.uniforms.uPuffCount!.value = n;
    },
    update(time) {
      material.uniforms.uTime!.value = time;
    },
    setHaze(near) {
      material.uniforms.uHaze!.value = near;
    },
  };
}
