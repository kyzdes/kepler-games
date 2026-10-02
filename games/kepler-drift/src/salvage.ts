import * as T from 'three';
import { crystal } from './models.ts';
import { asteroidOre, splitOre } from './state.ts';

interface Ore {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  value: number;
}

const MAX_CRYSTALS = 150;

/** Visual salvage is bounded; each asteroid's reward is kept independently. */
export class Salvage {
  private readonly scene: T.Scene;
  private readonly rng: () => number;
  private readonly ores: Ore[] = [];
  private readonly direction = new T.Vector3();

  constructor(scene: T.Scene, rng: () => number) {
    this.scene = scene;
    this.rng = rng;
  }

  get drops(): readonly Ore[] { return this.ores; }
  get count(): number { return this.ores.length; }

  drop(position: T.Vector3, radius: number, rich: boolean): void {
    this.dropReward(position, asteroidOre(radius, rich), radius);
  }

  dropReward(position: T.Vector3, reward: number, radius = 3): void {
    reward = Math.max(0, Math.floor(reward));
    if (!reward) return;
    const values = splitOre(reward, Math.min(5, Math.ceil(radius), MAX_CRYSTALS - this.ores.length));
    // A full pool merges the reward into the nearest cluster without losing ore.
    if (!values.length && this.ores.length) {
      const nearest = this.ores.reduce((a, b) =>
        a.mesh.position.distanceToSquared(position) < b.mesh.position.distanceToSquared(position) ? a : b);
      nearest.value += reward;
      nearest.life = Math.max(nearest.life, 18);
    }
    for (const value of values) {
      const mesh = crystal();
      mesh.scale.set(.19, .34 + this.rng() * .19, .22);
      mesh.position.copy(position).add(this.direction.set(
        this.rng() - .5, this.rng() - .5, this.rng() - .5,
      ).multiplyScalar(radius * 1.1));
      this.scene.add(mesh);
      this.ores.push({
        mesh,
        velocity: new T.Vector3((this.rng() - .5) * 3, (this.rng() - .5) * 3, 3 + this.rng() * 4),
        life: 18, value,
      });
    }
  }

  update(dt: number, worldSpeed: number, ship: T.Vector3, magnet: number, onPickup: (value: number, position: T.Vector3) => void): void {
    for (let i = this.ores.length - 1; i >= 0; i--) {
      const ore = this.ores[i];
      ore.life -= dt;
      this.direction.copy(ship).sub(ore.mesh.position);
      const distance = this.direction.length();
      if (distance < magnet) {
        ore.velocity.lerp(this.direction.normalize().multiplyScalar(22 + (magnet - distance) * 1.2), 1 - Math.exp(-dt * 4));
      } else {
        ore.velocity.z += (worldSpeed - ore.velocity.z) * dt * .5;
      }
      ore.mesh.position.addScaledVector(ore.velocity, dt);
      ore.mesh.rotation.y += dt * 2;
      ore.mesh.rotation.z += dt * .65;
      if (distance < 1.6) {
        onPickup(ore.value, ore.mesh.position);
        ore.life = 0;
      }
      if (ore.life <= 0 || ore.mesh.position.z > 25) {
        this.scene.remove(ore.mesh);
        this.ores.splice(i, 1);
      }
    }
  }

  collectAll(onCollect: (value: number) => void): void {
    for (const ore of this.ores) onCollect(ore.value);
    this.reset();
  }

  reset(): void {
    for (const ore of this.ores) this.scene.remove(ore.mesh);
    this.ores.length = 0;
  }
}
