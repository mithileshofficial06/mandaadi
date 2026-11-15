// Sea events (cosmetic): a pod of dolphins that surfaces alongside your boat now and then, and a
// fishing trawler steaming across the far side of the course with its wake.
import { CapsuleGeometry, ConeGeometry, Group, Mesh, MeshLambertMaterial, BoxGeometry } from 'three';
import { bake } from './bake';
import { LIVERIES, beachedHull } from './boatModel';
import { createWake, type Wake } from './effects';

export type SeaLife = { group: Group; wake: Wake; update(t: number, dt: number, boat: { x: number; y: number; h: number }): void };

function dolphin(): Mesh {
  const g = new Group();
  const skin = new MeshLambertMaterial({ color: '#56656e' });
  const body = new Mesh(new CapsuleGeometry(0.32, 1.7, 4, 8), skin);
  body.rotation.x = Math.PI / 2;
  const fin = new Mesh(new ConeGeometry(0.18, 0.5, 4), skin);
  fin.position.set(0, 0.38, 0.1);
  fin.rotation.x = -0.5;
  const tail = new Mesh(new BoxGeometry(0.9, 0.06, 0.3), skin);
  tail.position.set(0, 0, 1.25);
  g.add(body, fin, tail);
  return new Mesh(bake(g), new MeshLambertMaterial({ vertexColors: true }));
}

export function createSeaLife(): SeaLife {
  const group = new Group();
  const pod = [dolphin(), dolphin(), dolphin()];
  pod.forEach((d) => group.add(d));
  // trawler: a big hull with a wheelhouse
  const tg = new Group();
  const hull = new Mesh(beachedHull(LIVERIES[2]!), new MeshLambertMaterial({ vertexColors: true }));
  hull.scale.set(1.6, 1.8, 2.4);
  const house = new Mesh(new BoxGeometry(1.8, 1.6, 2.2), new MeshLambertMaterial({ color: '#ece4d2' }));
  house.position.set(0, 1.9, 2.5);
  const roof = new Mesh(new BoxGeometry(2.1, 0.15, 2.5), new MeshLambertMaterial({ color: '#1f5fa8' }));
  roof.position.set(0, 2.75, 2.5);
  tg.add(hull, house, roof);
  const trawler = new Mesh(bake(tg), new MeshLambertMaterial({ vertexColors: true }));
  group.add(trawler);
  const wake = createWake({ life: 16, opacity: 0.7 });
  let nextPod = 12;
  let podT = -1;
  let base = { x: 0, y: 0, h: 0 };
  let wakeAcc = 0;
  return {
    group,
    wake,
    update(t, dt, boat) {
      // dolphins: every ~20 s, three leaps alongside the boat over 3 s
      if (podT < 0 && t > nextPod) {
        podT = 0;
        base = { ...boat };
      }
      pod.forEach((d, i) => {
        if (podT < 0) {
          d.visible = false;
          return;
        }
        const k = podT - i * 0.35;
        const ph = (k % 1.1) / 1.1;
        d.visible = k > 0 && podT < 3.4;
        const side = 7 + i * 1.8;
        const along = 4 + k * 7;
        const x = base.x + Math.sin(base.h) * along + Math.cos(base.h) * side;
        const y = base.y + Math.cos(base.h) * along - Math.sin(base.h) * side;
        d.position.set(x, Math.sin(ph * Math.PI) * 1.6 - 0.4, -y);
        d.rotation.set(-Math.cos(ph * Math.PI) * 0.8, -base.h, 0);
      });
      if (podT >= 0) {
        podT += dt;
        if (podT > 3.4) {
          podT = -1;
          nextPod = t + 18 + Math.random() * 10;
        }
      }
      // trawler: crosses north of the course, west to east, every 4 minutes
      const tt = (t % 240) / 240;
      const tx = -150 + tt * 700;
      const ty = 360;
      trawler.position.set(tx, 0, -ty);
      trawler.rotation.y = -Math.PI / 2;
      wakeAcc += dt;
      if (wakeAcc > 0.15) {
        wakeAcc = 0;
        wake.push(tx - 9, ty, Math.PI / 2, 0.9, t);
      }
      wake.update(t);
    },
  };
}
