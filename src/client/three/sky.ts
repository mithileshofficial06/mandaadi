// Sky dome: a tropical gradient, a soft glow around the sun, slow fair-weather cumulus and a hazy
// horizon band. Procedural (no textures). Only visible in the orbit views and at the horizon.
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, type Vector3 } from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}
`;

const frag = /* glsl */ `
uniform vec3 uTop, uHorizon, uSun;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  // sun glow
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(sd, 8.0) * 0.18 + pow(sd, 200.0) * 0.9);
  // cumulus: project onto a cloud layer, thinner towards the horizon
  if (d.y > 0.02) {
    vec2 cp = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(cp);
    float cov = smoothstep(0.55, 0.78, c) * smoothstep(0.02, 0.25, d.y);
    float shade = 0.82 + 0.18 * smoothstep(0.5, 0.9, fbm(cp + vec2(0.15, 0.1)));
    col = mix(col, vec3(1.0, 0.99, 0.97) * shade, cov * 0.9);
  }
  // haze band at the horizon (and below it, for any gap past the sea)
  col = mix(col, uHorizon * 1.02, smoothstep(0.12, 0.0, d.y) * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type Sky = { mesh: Mesh; update(time: number, camPos: Vector3): void };

export function createSky(sunDir: Vector3): Sky {
  const mat = new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color('#3f8fca') },
      uHorizon: { value: new Color('#d9ecf2') },
      uSun: { value: new Color('#fff2d8') },
      uSunDir: { value: sunDir.clone().normalize() },
      uTime: { value: 0 },
    },
  });
  const mesh = new Mesh(new SphereGeometry(2500, 32, 16), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, camPos) {
      mat.uniforms.uTime!.value = time;
      mesh.position.copy(camPos);
    },
  };
}
