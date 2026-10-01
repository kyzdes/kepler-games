import * as T from 'three';
import type { Rock } from './asteroids.ts';
import { segmentSphereHit } from './state.ts';

interface Projectile {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
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
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly impact = new T.Vector3();

  constructor(scene: T.Scene) { this.scene = scene; }

  get count(): number { return this.shots.length; }

  fire(muzzles: readonly T.Object3D[], aim: T.Vector3, multishot: boolean): void {
    for (const muzzle of muzzles) {
      muzzle.getWorldPosition(this.start);
      const spreads = multishot ? [-.032, 0, .032] : [0];
      for (const spread of spreads) {
        const direction = aim.clone().sub(this.start).normalize();
        direction.x += spread;
        direction.normalize();
        const mesh = new T.Mesh(this.geometry, this.material);
        mesh.position.copy(this.start);
        mesh.quaternion.setFromUnitVectors(UP, direction);
        this.scene.add(mesh);
        this.shots.push({ mesh, velocity: direction.multiplyScalar(160), life: 1.8 });
      }
    }
  }

  update(dt: number, rocks: readonly Rock[], damage: number, onHit: (rock: Rock, position: T.Vector3) => void): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
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
        hit.hp -= damage;
        this.impact.copy(this.start).lerp(this.end, nearest);
        shot.life = 0;
        onHit(hit, this.impact);
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
