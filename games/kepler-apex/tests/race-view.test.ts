import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCar } from '../src/car.ts';
import { RaceView } from '../src/race-view.ts';
import { createRace, stepRace } from '../src/rules.ts';
import { TRACK_LENGTH, curvatureAt } from '../src/track.ts';
import { CAR_BOUNDS } from '../src/framing.ts';

const input = { steer: .5, throttle: true, brake: false, handbrake: false, boost: true };

test('the race view follows the simulation without changing clocks, drivers or physics', () => {
  const cars = Array.from({ length: 6 }, () => createCar());
  const view = new RaceView(new T.PerspectiveCamera(58, 16 / 9, .15, 2000), cars, false);
  const race = createRace(); race.phase = 'racing';
  for (let frame = 0; frame < 180; frame++) {
    stepRace(race, input, 1 / 60, TRACK_LENGTH, curvatureAt);
    const before = structuredClone(race);
    view.update(race, input, 1 / 60, frame / 60, 900);
    assert.deepEqual(race, before);
  }
  assert.notEqual(cars[0].wheels[0].rotation.x, 0);
  assert.equal(cars[0].body.rotation.y, -race.heading);
  const wheel = cars[0].wheels[0].rotation.x;
  race.phase = 'paused';
  view.update(race, input, 1 / 60, 3, 900);
  assert.equal(cars[0].wheels[0].rotation.x, wheel);
});

test('view reset removes the previous body motion and menu only shows the player car', () => {
  const cars = Array.from({ length: 6 }, () => createCar());
  const view = new RaceView(new T.PerspectiveCamera(58, 16 / 9, .15, 2000), cars, false);
  const race = createRace(); race.phase = 'racing';
  race.acceleration = 30; race.lateralAcceleration = 40;
  for (let frame = 0; frame < 30; frame++) view.update(race, input, 1 / 60, frame / 60, 900);
  assert.ok(Math.abs(cars[0].body.rotation.x) > .01);
  assert.ok(Math.abs(cars[0].body.rotation.z) > .01);
  view.reset();
  const fresh = createRace();
  view.update(fresh, input, 0, 0, 900);
  assert.equal(cars[0].body.rotation.x, 0);
  assert.equal(cars[0].body.rotation.z, 0);
  assert.deepEqual(cars.map(car => car.root.visible), [true, false, false, false, false, false]);
  fresh.phase = 'countdown';
  view.update(fresh, input, 0, 0, 900);
  assert.ok(cars.every(car => car.root.visible));
});

test('reduced motion keeps the view steady, preserves the base field of view and still shows brake lights', () => {
  const cars = Array.from({ length: 6 }, () => createCar());
  const camera = new T.PerspectiveCamera(58, 16 / 9, .15, 2000);
  const view = new RaceView(camera, cars, true), race = createRace();
  race.phase = 'racing'; race.drivers[0].speed = 146; race.boosting = true; race.impact = 1;
  view.update(race, input, 0, 0, 900);
  const position = camera.position.clone(), rotation = camera.quaternion.clone();
  for (let frame = 1; frame <= 30; frame++) view.update(race, { ...input, brake: true }, 1 / 60, frame / 60, 900);
  assert.equal(camera.fov, 58);
  assert.ok(camera.position.distanceTo(position) < 1e-10);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  assert.equal(cars[0].body.position.y, 0);
  assert.equal(cars[0].tail.emissiveIntensity, 4);
});

test('the extracted view keeps the entire drifting car above the portrait instruments around the circuit', () => {
  const cars = Array.from({ length: 6 }, () => createCar());
  const camera = new T.PerspectiveCamera(58, 390 / 844, .15, 2000);
  const view = new RaceView(camera, cars, false), race = createRace(); race.phase = 'racing';
  race.heading = .5; race.drivers[0].speed = 146; race.boosting = true;
  for (const lane of [-10.9, 0, 10.9]) for (let sample = 0; sample < 90; sample++) {
    race.drivers[0].distance = sample / 90 * TRACK_LENGTH;
    race.drivers[0].lane = lane;
    view.resetCamera();
    view.update(race, input, 1 / 60, sample / 60, 844);
    for (const corner of CAR_BOUNDS) {
      const p = corner.clone().applyMatrix4(cars[0].body.matrixWorld).project(camera);
      assert.ok(Math.abs(p.x) <= .855, `Horizontal clipping at section ${sample}, lane ${lane}`);
      assert.ok((1 - p.y) / 2 <= .638, `Instrument overlap at section ${sample}, lane ${lane}`);
    }
  }
});
