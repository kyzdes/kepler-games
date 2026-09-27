import * as T from 'three';
import { segmentSphereHit } from './state.ts';

// Local coordinates of the solid hull, pods, swept wings and cannons in
// createShip(). Engine exhaust is deliberately outside the collision body.
const parts: [number, number, number, number][] = [
  [0, 0, -3.4, .27], [0, 0, -2.7, .48], [0, 0, -1.7, .7],
  [0, 0, -.65, .85], [0, 0, .45, .9], [0, 0, 1.5, .86],
  [0, 0, 2.15, .65], [0, .6, -.7, .43],
];
for (const side of [-1, 1]) {
  for (const z of [-1.1, -.3, .55, 1.4, 2.1]) parts.push([side * 1.67, .1, z, .68]);
  for (const [x, z, radius] of [[2.3, 1.2, .4], [2.7, 1.45, .36], [3.15, 1.65, .33], [3.6, 1.85, .32], [3.93, 2.05, .25]]) {
    parts.push([side * x, .18, z, radius]);
  }
  for (const z of [-3.43, -2.88, -2.33, -1.78]) parts.push([side * 1.04, .43, z, .18]);
}

/** A compound body that follows the rendered ship's scale, banking and motion. */
export class ShipCollider {
  private readonly spheres = parts.map(([x, y, z, radius]) => ({
    local: new T.Vector3(x, y, z), radius,
    from: new T.Vector3(), to: new T.Vector3(),
  }));
  private scale = 1;

  setMotion(from: T.Matrix4, to: T.Matrix4): void {
    this.scale = Math.max(from.getMaxScaleOnAxis(), to.getMaxScaleOnAxis());
    for (const sphere of this.spheres) {
      sphere.from.copy(sphere.local).applyMatrix4(from);
      sphere.to.copy(sphere.local).applyMatrix4(to);
    }
  }

  intersectsRock(from: T.Vector3, to: T.Vector3, radius: number): boolean {
    for (const sphere of this.spheres) {
      // Sweep in relative coordinates: fast ship and asteroid movement cannot
      // skip a contact between two rendered frames.
      if (segmentSphereHit(
        from.x - sphere.from.x, from.y - sphere.from.y, from.z - sphere.from.z,
        to.x - sphere.to.x, to.y - sphere.to.y, to.z - sphere.to.z,
        0, 0, 0, radius + sphere.radius * this.scale,
      ) !== null) return true;
    }
    return false;
  }
}
