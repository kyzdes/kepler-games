import * as T from 'three';
import type { Rock } from './asteroids.ts';
import { segmentSphereHit } from './state.ts';
import { PLASMA_RADIUS } from './weapons.ts';

export type ProjectileKind = 'pulse' | 'plasma';
interface ShotOptions { kind: ProjectileKind; damage: number; }

interface Projectile {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  kind: ProjectileKind;
  damage?: number;
}

const UP = new T.Vector3(0, 1, 0);

/** Owns laser meshes and resolves the first swept hit along each shot. */
export class Projectiles {
  private readonly scene: T.Scene;
  private readonly shots: Projectile[] = [];
  private readonly geometry = new T.CylinderGeometry(.038, .065, 2.4, 6);
  private readonly material = new T.MeshBasicMaterial({
    color: new T.Color(5, 1.6, .35), toneMapped: false,
  });
  private readonly plasmaGeometry = new T.IcosahedronGeometry(.38, 1);
  private readonly plasmaMaterial = new T.MeshBasicMaterial({ color: new T.Color(.7, 1.1, 4), toneMapped: false });
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly impact = new T.Vector3();

  constructor(scene: T.Scene) { this.scene = scene; }

  get count(): number { return this.shots.length; }

  fire(muzzles: readonly T.Object3D[], aim: T.Vector3, multishot: boolean, options?: ShotOptions): void {
    const kind = options?.kind ?? 'pulse';
    // Plasma launches one heavier salvo between the cannons, rather than two
    // overlapping explosions paying damage twice at the same point.
    const origins = kind === 'plasma' ? muzzles.slice(0, 1) : muzzles;
    for (const muzzle of origins) {
      muzzle.getWorldPosition(this.start);
      if (kind === 'plasma' && muzzles.length > 1) {
        muzzles[1].getWorldPosition(this.end); this.start.add(this.end).multiplyScalar(.5);
      }
      const spreadSize = kind === 'plasma' ? .055 : .032;
      const spreads = multishot ? [-spreadSize, 0, spreadSize] : [0];
      for (const spread of spreads) {
        const direction = aim.clone().sub(this.start).normalize();
        direction.x += spread;
        direction.normalize();
        const mesh = new T.Mesh(kind === 'plasma' ? this.plasmaGeometry : this.geometry, kind === 'plasma' ? this.plasmaMaterial : this.material);
        mesh.position.copy(this.start);
        mesh.quaternion.setFromUnitVectors(UP, direction);
        this.scene.add(mesh);
        this.shots.push({ mesh, velocity: direction.multiplyScalar(kind === 'plasma' ? 105 : 160), life: kind === 'plasma' ? 2.6 : 1.8, kind, damage: options?.damage });
      }
    }
  }

  update(dt: number, rocks: readonly Rock[], damage: number,
    onHit: (rock: Rock, position: T.Vector3, kind: ProjectileKind) => void,
    onBlast: (position: T.Vector3) => void = () => {}, alive: () => boolean = () => true): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      if (!alive()) break;
      shot.life -= dt;
      this.start.copy(shot.mesh.position);
      this.end.copy(this.start).addScaledVector(shot.velocity, dt);
      let hit: Rock | null = null, nearest = 2;
      for (const rock of rocks) {
        if (rock.wait > 0) continue;
        const p = rock.root.position;
        const time = segmentSphereHit(
          this.start.x, this.start.y, this.start.z, this.end.x, this.end.y, this.end.z,
          p.x, p.y, p.z, rock.radius * .93,
        );
        if (time !== null && time < nearest) { nearest = time; hit = rock; }
      }
      if (hit) {
        this.impact.copy(this.start).lerp(this.end, nearest);
        shot.life = 0;
        const power = shot.damage ?? damage;
        hit.hp -= power;
        onHit(hit, this.impact, shot.kind);
        if (shot.kind === 'plasma') {
          onBlast(this.impact);
          for (const rock of rocks) {
            if (rock === hit || rock.wait > 0 || !alive()) continue;
            const distance = Math.max(0, rock.root.position.distanceTo(this.impact) - rock.radius * .5);
            if (distance >= PLASMA_RADIUS) continue;
            rock.hp -= power * .7 * (1 - distance / PLASMA_RADIUS);
            onHit(rock, rock.root.position, shot.kind);
          }
        }
      }
      shot.mesh.position.copy(this.end);
      if (shot.life <= 0) {
        this.scene.remove(shot.mesh);
        this.shots.splice(i, 1);
      }
    }
  }

  reset(): void {
    for (const shot of this.shots) this.scene.remove(shot.mesh);
    this.shots.length = 0;
  }
}
