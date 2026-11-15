// A look per race type: time of day, sky and light, and rain for the storm. Cosmetic only.
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Vector3 } from 'three';
import type { RaceType } from '../../shared/core/course';

export type Weather = {
  /** Sun elevation (deg) and azimuth offset from the wind (rad). */
  sunEl: number;
  sunAz: number;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  skyTop: string;
  skyHorizon: string;
  exposure: number;
  rain: boolean;
  label: string;
};

const NOON: Weather = { sunEl: 52, sunAz: 1.25, sun: '#fff1d6', sunI: 2.4, hemiSky: '#cfe9ff', hemiGround: '#d8c79c', hemiI: 1.25, skyTop: '#3f8fca', skyHorizon: '#d9ecf2', exposure: 1.05, rain: false, label: 'Midday sun' };

export const WEATHER: Record<RaceType, Weather> = {
  light: { ...NOON, sunEl: 22, sunAz: 0.9, sun: '#ffdcae', sunI: 2.1, hemiSky: '#d6e6f2', hemiI: 1.15, skyTop: '#79b2da', skyHorizon: '#f3e4d2', label: 'Early morning, glassy water' },
  windward: NOON,
  shifty: { ...NOON, sunEl: 40, skyHorizon: '#e3ecee', skyTop: '#5c9ccc', label: 'Hazy afternoon, the wind swings' },
  tide: { ...NOON, sunEl: 20, sunAz: 1.6, sun: '#ffc98c', sunI: 2.2, hemiSky: '#e9dcc8', skyTop: '#6f9fcb', skyHorizon: '#f6d8b0', exposure: 1.02, label: 'Late afternoon, the tide is running' },
  storm: { ...NOON, sunEl: 62, sun: '#cfd6db', sunI: 1.3, hemiSky: '#a9b6be', hemiGround: '#8d8a80', hemiI: 1.35, skyTop: '#55656f', skyHorizon: '#9aa6ad', exposure: 0.98, rain: true, label: 'Monsoon squalls and rain' },
  community: NOON,
  cup: { ...NOON, sunEl: 11, sunAz: 1.9, sun: '#ffb27a', sunI: 2.3, hemiSky: '#e8cdb6', hemiGround: '#c9a77e', skyTop: '#6787b4', skyHorizon: '#f6c597', exposure: 1.0, label: 'Sunset race' },
};

export type Rain = { lines: LineSegments; update(cam: Vector3, dt: number): void };

/** Rain streaks around the camera. */
export function createRain(n = 900): Rain {
  const pos = new Float32Array(n * 6);
  const seed = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    seed[i * 3] = (Math.random() - 0.5) * 120;
    seed[i * 3 + 1] = Math.random() * 60;
    seed[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const geo = new BufferGeometry();
  const attr = new BufferAttribute(pos, 3);
  geo.setAttribute('position', attr);
  const lines = new LineSegments(geo, new LineBasicMaterial({ color: '#dfe7ea', transparent: true, opacity: 0.35, depthWrite: false }));
  lines.frustumCulled = false;
  return {
    lines,
    update(cam, dt) {
      for (let i = 0; i < n; i++) {
        let y = seed[i * 3 + 1]! - dt * 34;
        if (y < 0) y += 60;
        seed[i * 3 + 1] = y;
        const x = cam.x + seed[i * 3]!;
        const z = cam.z + seed[i * 3 + 2]!;
        const yy = Math.max(0, cam.y - 30) + y;
        pos.set([x, yy, z, x + 0.25, yy + 1.4, z], i * 6);
      }
      attr.needsUpdate = true;
    },
  };
}
