import * as T from 'three';
import type { Car } from './car.ts';
import type { Race, Input } from './rules.ts';
import { clamp } from './rules.ts';
import { frameAt } from './track.ts';
import { keepCarInFrame } from './framing.ts';

type RaceViewState = Readonly<Pick<Race,
  'phase' | 'lateralAcceleration' | 'acceleration' | 'heading' | 'impact' | 'steering' | 'boosting' | 'padBoost'
>> & { readonly drivers: readonly Readonly<Race['drivers'][number]>[] };

/** Reads race state to animate cars and frame the scene; never advances the race. */
export class RaceView {
  private readonly camera: T.PerspectiveCamera;
  private readonly cars: readonly Car[];
  private readonly reduced: boolean;
  private roll = 0;
  private rollSpeed = 0;
  private pitch = 0;
  private pitchSpeed = 0;
  private readonly look = new T.Vector3();
  private readonly target = new T.Vector3();
  private readonly lookTarget = new T.Vector3();
  private cameraReady = false;

  constructor(camera: T.PerspectiveCamera, cars: readonly Car[], reduced: boolean) {
    this.camera = camera;
    this.cars = cars;
    this.reduced = reduced;
  }
  resetCamera(): void { this.cameraReady = false; }

  reset(): void {
    this.resetCamera();
    this.roll = this.pitch = this.rollSpeed = this.pitchSpeed = 0;
  }
  update(race: RaceViewState, input: Readonly<Input>, dt: number, clock: number, viewportHeight: number): void {
    const menu = race.phase === 'menu', p = race.drivers[0];
    if (race.phase === 'racing') {
      const rollTarget = clamp(race.lateralAcceleration * .0022, -.14, .14);
      const pitchTarget = clamp(race.acceleration * .0011, -.095, .075);
      this.rollSpeed += ((rollTarget - this.roll) * 85 - this.rollSpeed * 13) * dt;
      this.roll += this.rollSpeed * dt;
      this.pitchSpeed += ((pitchTarget - this.pitch) * 75 - this.pitchSpeed * 12) * dt;
      this.pitch += this.pitchSpeed * dt;
    }
    race.drivers.forEach((driver, i) => {
      const car = this.cars[i], f = frameAt(driver.distance, driver.lane);
      car.root.position.copy(f.position).addScaledVector(f.up, .12);
      car.root.quaternion.copy(f.rotation);
      car.body.rotation.y = i === 0 ? -race.heading : 0;
      car.body.rotation.z = i === 0 ? this.roll : 0;
      car.body.rotation.x = i === 0 ? this.pitch : 0;
      car.body.position.y = this.reduced ? 0 : Math.sin(clock * 20 + i) * .018 * Math.min(1, driver.speed / 50) + (i === 0 ? Math.sin(clock * 38) * race.impact * .08 : 0);
      car.frontWheels.forEach(w => w.rotation.y = i === 0 ? -race.steering * .3 : 0);
      if (race.phase === 'racing')
        car.wheels.forEach(w => w.rotation.x -= driver.speed * dt / .68);
      const boosting = i === 0 && (race.boosting || race.padBoost > 0);
      car.flames.forEach(flame => {
        const length = boosting ? 2.5 : .25 + driver.speed * .005;
        flame.scale.y = length;
        flame.position.z = 3.17 + length;
        flame.visible = !menu || i === 0;
      });
      if (i === 0)
        car.tail.emissiveIntensity = input.brake || input.handbrake ? 4 : 1.1;
      car.root.visible = i === 0 || !menu;
    });
    const f = frameAt(p.distance, p.lane), ahead = frameAt(p.distance + 30, p.lane * .35);
    const target = this.target, look = this.lookTarget;
    if (menu) {
      const orbit = this.reduced ? 0 : Math.sin(clock * .12) * 1.2;
      target.copy(f.position).addScaledVector(f.forward, -13).addScaledVector(f.right, -11 + orbit).addScaledVector(f.up, 6.7);
      look.copy(f.position).addScaledVector(f.forward, 8).addScaledVector(f.right, -6).addScaledVector(f.up, 1.1);
      if (this.camera.aspect < .8) {
        target.copy(f.position).addScaledVector(f.forward, -16).addScaledVector(f.up, 9);
        look.copy(f.position).addScaledVector(f.forward, 7).addScaledVector(f.up, 3);
      }
    } else {
      const pullback = this.reduced ? 0 : p.speed * .013 + Math.max(0, race.acceleration) * .018;
      target.copy(f.position).addScaledVector(f.forward, -13.7 - pullback).addScaledVector(f.up, 6.8);
      look.copy(ahead.position).addScaledVector(ahead.up, 1.3);
      if (this.camera.aspect < .8) {
        target.addScaledVector(f.forward, -3.7).addScaledVector(f.up, 1.7);
        look.copy(f.position).addScaledVector(f.forward, 10).addScaledVector(f.up, 1.3);
      }
      if (!this.reduced && race.phase === 'racing')
        target.addScaledVector(f.right, Math.sin(clock * 57) * race.impact * .4).addScaledVector(f.up, Math.cos(clock * 43) * race.impact * .22);
    }
    const amount = !this.cameraReady ? 1 : 1 - Math.exp(-(menu ? 2.5 : 9) * dt);
    this.camera.position.lerp(target, amount);
    this.look.lerp(look, amount);
    this.camera.lookAt(this.look);
    this.cameraReady = true;
    const fov = 58 + (this.reduced ? 0 : Math.min(7, p.speed / 108 * 7) + (race.boosting || race.padBoost > 0 ? 5 : 0));
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-5 * dt));
    this.camera.updateProjectionMatrix();
    if (!menu && this.camera.aspect < .8)
      keepCarInFrame(this.camera, this.cars[0].body, this.look, Math.min(.63, 1 - 310 / viewportHeight));
  }
}
