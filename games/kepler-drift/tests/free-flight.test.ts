import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FreeFlight, FREE_FLIGHT_DEFAULT_THROTTLE, FREE_FLIGHT_MAX_SPEED } from '../src/free-flight.ts';
import type { FreeFlightControls } from '../src/free-flight.ts';
import { BarrelRoll } from '../src/maneuvers.ts';

const controls = (patch: Partial<FreeFlightControls> = {}): FreeFlightControls => ({
  steerX: 0, steerY: 0, strafe: 0, throttle: 0, boost: false, speed: 50, ...patch,
});
const forward = (flight: FreeFlight): T.Vector3 => new T.Vector3(0, 0, -1).applyQuaternion(flight.heading);
function fly(flight: FreeFlight, seconds: number, input: FreeFlightControls, hz = 120): void {
  const frames = Math.round(seconds * hz), dt = seconds / frames;
  for (let i = 0; i < frames; i++) flight.update(dt, input);
}

test('free flight moves in three dimensions and can strafe beyond the old corridor', () => {
  const sideways = new FreeFlight(); sideways.throttle = 0;
  fly(sideways, 3, controls({ strafe: 1 }));
  assert.ok(sideways.position.x > 70);
  assert.equal(sideways.position.y, 0); assert.equal(sideways.position.z, 0);
  assert.ok(sideways.velocity.x > 27);

  const climbing = new FreeFlight();
  fly(climbing, .9, controls({ steerY: 1 }));
  fly(climbing, 1.5, controls());
  assert.ok(forward(climbing).y > .8);
  assert.ok(climbing.position.y > 45);
  assert.ok(climbing.position.z < -25);
});

test('turning around produces backward world-space flight rather than scrolling the field', () => {
  const flight = new FreeFlight();
  fly(flight, 2, controls({ steerX: 1 }));
  fly(flight, 1, controls());
  assert.ok(forward(flight).z > .9);
  const z = flight.position.z;
  fly(flight, 3, controls());
  assert.ok(flight.position.z > z + 85);
  assert.ok(flight.velocity.z > 30);
});

test('mouse center has a deadzone and local steering remains intuitive through a pitch loop', () => {
  const centered = new FreeFlight();
  fly(centered, 2, controls({ steerX: .02, steerY: -.03 }));
  assert.ok(centered.heading.angleTo(new T.Quaternion()) < 1e-8);
  assert.equal(centered.bank, 0);

  const flight = new FreeFlight();
  fly(flight, Math.PI / 1.4, controls({ steerY: 1 }));
  fly(flight, 1.5, controls());
  assert.ok(forward(flight).z > .999);
  const inverted = flight.heading.clone();
  const localRight = new T.Vector3(1, 0, 0).applyQuaternion(inverted);
  fly(flight, .5, controls({ steerX: 1 }));
  assert.ok(forward(flight).dot(localRight) > .4, 'Mouse right still turns toward the ship local right when inverted');
  assert.ok(Math.abs(flight.heading.length() - 1) < 1e-10);

  const loop = new FreeFlight();
  fly(loop, 2 * Math.PI / 1.4, controls({ steerY: 1 }));
  fly(loop, 1.5, controls());
  assert.ok(loop.heading.angleTo(new T.Quaternion()) < .00001);
});

test('W/S change a bounded throttle, zero throttle brakes, and boost increases speed under the cap', () => {
  const flight = new FreeFlight();
  fly(flight, 2, controls({ throttle: 1 }));
  assert.equal(flight.throttle, 1);
  fly(flight, 2, controls());
  const cruise = flight.speed;
  assert.ok(cruise > 49.9 && cruise <= 50);
  fly(flight, 2, controls({ boost: true }));
  assert.ok(flight.speed > cruise * 2.59 && flight.speed <= cruise * 2.61);
  fly(flight, 4, controls({ throttle: -1 }));
  assert.equal(flight.throttle, 0);
  fly(flight, 2, controls());
  assert.ok(flight.speed < .01);

  flight.throttle = 7; assert.equal(flight.throttle, 1);
  fly(flight, 3, controls({ strafe: 1, boost: true, speed: 1000000 }));
  assert.ok(flight.speed > FREE_FLIGHT_MAX_SPEED - .01);
  assert.ok(flight.speed <= FREE_FLIGHT_MAX_SPEED + 1e-10);
  flight.throttle = -1; assert.equal(flight.throttle, 0);
});

test('the same timed commands produce approximately equal paths at 30, 60 and 144 Hz', () => {
  const flights = [30, 60, 144].map(hz => {
    const flight = new FreeFlight();
    fly(flight, 2, controls({ steerX: .48, steerY: .26, throttle: .3, strafe: -.35 }), hz);
    fly(flight, 1, controls({ steerX: -.2, steerY: .6, boost: true }), hz);
    fly(flight, 2, controls({ throttle: -.4 }), hz);
    return flight;
  });
  for (const flight of flights.slice(1)) {
    assert.ok(flight.position.distanceTo(flights[0].position) < .08);
    assert.ok(flight.velocity.distanceTo(flights[0].velocity) < .025);
    assert.ok(flight.heading.angleTo(flights[0].heading) < .0001);
    assert.ok(Math.abs(flight.throttle - flights[0].throttle) < 1e-10);
  }
});

test('cockpit and chase cameras use navigation heading and never inherit cosmetic bank or barrel roll', () => {
  const flight = new FreeFlight();
  fly(flight, .6, controls({ steerX: .6, steerY: .4, strafe: 1 }));
  assert.ok(Math.abs(flight.bank) > .1);
  const camera = new T.PerspectiveCamera(59, 16 / 9, .1, 1500);
  const cockpit = new T.Vector3(0, .9, -.85).applyQuaternion(flight.heading).add(flight.position);
  flight.resetCamera(camera, 'cockpit');
  assert.ok(camera.position.distanceTo(cockpit) < 1e-10);
  assert.ok(camera.quaternion.angleTo(flight.heading) < 1e-7);
  flight.updateCamera(camera, 1 / 60, 'chase');
  const chase = new T.Vector3(0, 4.2, 19).applyQuaternion(flight.heading).add(flight.position);
  assert.ok(camera.position.distanceTo(chase) < 1e-10, 'A view switch snaps to its own offset');

  const orientation = camera.quaternion.clone(), position = camera.position.clone(), fov = camera.fov;
  const model = new T.Object3D(), roll = new BarrelRoll();
  roll.start(1);
  for (let frame = 0; frame < 150; frame++) {
    const motion = roll.update(1 / 120);
    model.quaternion.copy(flight.heading).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), flight.bank + motion.angle));
    flight.updateCamera(camera, 1 / 120, 'chase');
    assert.ok(camera.quaternion.angleTo(orientation) < 1e-7);
    assert.ok(camera.position.distanceTo(position) < 1e-10);
    assert.equal(camera.fov, fov);
  }
  assert.ok(model.quaternion.angleTo(camera.quaternion) > .1);
});

test('invalid input is neutral, stalled frames are bounded, and reset removes every motion and camera state', () => {
  const flight = new FreeFlight();
  flight.update(NaN, controls()); flight.update(Infinity, controls()); flight.update(-2, controls());
  assert.equal(flight.position.length(), 0);
  flight.update(1 / 60, controls({ steerX: NaN, steerY: Infinity, strafe: -Infinity, throttle: NaN, speed: Infinity }));
  assert.equal(flight.speed, 0); assert.ok(flight.heading.angleTo(new T.Quaternion()) < 1e-8);
  flight.throttle = 1;
  flight.update(1000, controls({ boost: true, speed: 1000 }));
  assert.ok(flight.position.length() < FREE_FLIGHT_MAX_SPEED * .1);
  fly(flight, 1, controls({ steerX: 1, steerY: -.4, strafe: 1 }));
  const camera = new T.PerspectiveCamera(59, 1, .1, 1500);
  flight.resetCamera(camera, 'cockpit');
  flight.reset();
  assert.equal(flight.position.length(), 0); assert.equal(flight.speed, 0); assert.equal(flight.bank, 0);
  assert.equal(flight.throttle, FREE_FLIGHT_DEFAULT_THROTTLE);
  assert.ok(flight.heading.angleTo(new T.Quaternion()) < 1e-8);
  flight.update(1 / 60, controls({ speed: 0 }));
  assert.equal(flight.speed, 0); assert.ok(flight.heading.angleTo(new T.Quaternion()) < 1e-8);
  flight.updateCamera(camera, 1 / 60, 'chase');
  assert.deepEqual(camera.position.toArray(), [0, 4.2, 19]);
  assert.ok(camera.quaternion.angleTo(new T.Quaternion()) < 1e-8);
});
