import * as T from 'three';
import type { Rock } from './asteroids.ts';
import { segmentSphereHit } from './state.ts';
import { CUTTER_RANGE, CUTTER_WIDTH } from './weapons.ts';
import type { CombatHits } from './projectiles.ts';
import type { CombatTarget } from './combat.ts';

const UP = new T.Vector3(0, 1, 0);

/** Twin continuous rays pierce every active asteroid in the aiming lane. */
export class CuttingBeam {
  readonly root = new T.Group();
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly direction = new T.Vector3();
  private readonly rays: T.Group[] = [];

  constructor(scene: T.Scene) {
    const geometry = new T.CylinderGeometry(1, 1, 1, 8);
    const core = new T.MeshBasicMaterial({ color: new T.Color(1.8, 3.2, 4), toneMapped: false });
    const glow = new T.MeshBasicMaterial({ color: 0x5be5ff, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 2; i++) {
      const ray = new T.Group();
      const inner = new T.Mesh(geometry, core), outer = new T.Mesh(geometry, glow);
      inner.scale.set(.11, CUTTER_RANGE, .11);
      outer.scale.set(.42, CUTTER_RANGE, .42);
      ray.add(inner, outer); this.rays.push(ray); this.root.add(ray);
    }
    this.root.visible = false;
    this.root.name = 'Режущий луч';
    scene.add(this.root);
  }

  update(muzzles: readonly T.Object3D[], aim: T.Vector3, rocks: readonly Rock[],
    onCut: (rock: Rock, direction: T.Vector3) => void, alive: () => boolean = () => true,
    combat?: CombatHits, damage = 0): void {
    this.root.visible = true;
    const hits = new Map<Rock, number>();
    const hostiles = new Set<CombatTarget>();
    for (let index = 0; index < this.rays.length; index++) {
      const muzzle = muzzles[index] ?? muzzles[0];
      if (!muzzle) { this.rays[index].visible = false; continue; }
      muzzle.getWorldPosition(this.start);
      this.direction.copy(aim).sub(this.start).normalize();
      this.end.copy(this.start).addScaledVector(this.direction, CUTTER_RANGE);
      const ray = this.rays[index]; ray.visible = true;
      ray.position.copy(this.start).lerp(this.end, .5);
      ray.quaternion.setFromUnitVectors(UP, this.direction);
      for (const rock of rocks) {
        if (rock.wait > 0 || rock.root.position.z > this.start.z) continue;
        const p = rock.root.position;
        const time = segmentSphereHit(this.start.x, this.start.y, this.start.z,
          this.end.x, this.end.y, this.end.z, p.x, p.y, p.z, rock.radius * .93 + CUTTER_WIDTH);
        if (time !== null) hits.set(rock, Math.min(hits.get(rock) ?? Infinity, time));
      }
      for (const target of combat?.targets ?? []) {
        if (!target.active || target.position.z > this.start.z) continue;
        const p=target.position;
        if (segmentSphereHit(this.start.x,this.start.y,this.start.z,this.end.x,this.end.y,this.end.z,p.x,p.y,p.z,target.radius+CUTTER_WIDTH)!==null) hostiles.add(target);
      }
    }
    for (const [rock] of [...hits].sort((a, b) => a[1] - b[1])) {
      if (!alive()) break;
      onCut(rock, this.direction);
    }
    for (const target of hostiles) {
      if (!alive()) break;
      if (target.active && damage>0) combat!.hit(target,damage,target.position);
    }
  }
  hide(): void { this.root.visible = false; }
}
