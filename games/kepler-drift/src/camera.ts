import * as T from 'three';
import { rollAngle, rollHeight } from './maneuvers.ts';

const HEIGHT = 4;
const DISTANCE = 20;
const MAX_LAG = .65;

/** Fixed view direction and focal length. Only deliberate flight translation is
 * followed; ship roll, its visual arc, impact and boost never rotate the view. */
export class StableFlightCamera {
  private aspect = -1;
  private pitch = 0;

  configure(camera: T.PerspectiveCamera): void {
    if (this.aspect === camera.aspect) return;
    this.aspect = camera.aspect;
    camera.fov = camera.aspect < .85 ? 76 : 59;
    camera.updateProjectionMatrix();
    const maxScreenY = camera.aspect < .85 ? .73 : .765;
    // Reserve the entire maneuver once per viewport. Reframing each animated
    // wing tip caused the previous repeated camera pitch corrections.
    let lowestAngle = 0;
    const matrix = new T.Matrix4(), rotation = new T.Euler(), point = new T.Vector3();
    for (let step = 0; step <= 48; step++) {
      const p = step / 48;
      for (const direction of [-1, 1]) for (const bank of [-.42, .42]) for (const pitch of [-.22, .22]) for (const yaw of [-.16, .16]) {
        matrix.makeRotationFromEuler(rotation.set(pitch, yaw, bank + direction * rollAngle(p)));
        for (const x of [-4.2, 4.2]) for (const y of [-.8, 1.1]) for (const z of [-3.8, 2.8]) {
          point.set(x, y, z).multiplyScalar(1.04).applyMatrix4(matrix);
          lowestAngle = Math.min(lowestAngle, Math.atan2(point.y + rollHeight(p) - HEIGHT - MAX_LAG, DISTANCE - point.z));
        }
      }
    }
    this.pitch = Math.min(-Math.atan2(2.5, 53.2), lowestAngle - Math.atan((1 - maxScreenY * 2) * Math.tan(T.MathUtils.degToRad(camera.fov / 2))));
    camera.rotation.set(this.pitch, 0, 0);
  }

  reset(camera: T.PerspectiveCamera, x = 0, y = 0): void {
    this.configure(camera);
    camera.position.set(x, y + HEIGHT, DISTANCE);
    camera.rotation.set(this.pitch, 0, 0); camera.updateMatrixWorld();
  }

  update(camera: T.PerspectiveCamera, x: number, y: number, dt: number): void {
    this.configure(camera);
    const follow = 1 - Math.exp(-Math.max(0, dt) * 7);
    camera.position.x = T.MathUtils.clamp(T.MathUtils.lerp(camera.position.x, x, follow), x - MAX_LAG, x + MAX_LAG);
    camera.position.y = T.MathUtils.clamp(T.MathUtils.lerp(camera.position.y, y + HEIGHT, follow), y + HEIGHT - MAX_LAG, y + HEIGHT + MAX_LAG);
    camera.position.z = DISTANCE;
    camera.rotation.set(this.pitch, 0, 0);
    camera.updateMatrixWorld();
  }
}
