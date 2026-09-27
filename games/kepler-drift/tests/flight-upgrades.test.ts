import test from 'node:test';
import assert from 'node:assert/strict';
import { asteroidOre, splitOre, flightSpeed, mulberry32, SECTOR_SECONDS, UPGRADES } from '../src/state.ts';
import { BarrelRoll, ROLL_DISTANCE, ROLL_DURATION, ROLL_COOLDOWN } from '../src/maneuvers.ts';
import { rollDirection } from '../src/input.ts';
import { PlanetStorm, lightningEnvelope } from '../src/storm.ts';

test('salvage is bounded by asteroid size and richness, not particle count', () => {
  for (let radius = 1; radius <= 6; radius += .1) {
    const rich = asteroidOre(radius, true), ordinary = asteroidOre(radius, false);
    assert.ok(rich >= 3 && rich <= 10 && ordinary >= 1 && ordinary <= 2 && rich > ordinary);
    for (let cap = 1; cap <= 5; cap++) for (const total of [rich, ordinary]) {
      const pieces = splitOre(total, cap);
      assert.equal(pieces.reduce((sum, value) => sum + value, 0), total);
      assert.ok(pieces.length <= cap && pieces.every(value => Number.isInteger(value) && value > 0));
    }
  }
  assert.deepEqual(splitOre(10, 0), []);
});

test('twenty mixed kills typically fund one or two basic upgrades instead of the whole shop', () => {
  let total = 0;
  for (let seed = 0; seed < 100; seed++) {
    const rng = mulberry32(seed);
    for (let i = 0; i < 20; i++) total += asteroidOre(1 + rng() ** 1.4 * 4.8, i % 4 !== 3);
  }
  const mean = total / 100;
  assert.ok(mean >= UPGRADES.laser.cost + UPGRADES.repair.cost);
  assert.ok(mean < UPGRADES.magnet.cost + UPGRADES.engine.cost + UPGRADES.laser.cost);
});

test('forward speed increases within sectors and never drops at a sector boundary', () => {
  let previous = 0;
  for (let sector = 1; sector <= 3; sector++) for (let seconds = 0; seconds <= SECTOR_SECONDS; seconds++) {
    const speed = flightSpeed(sector, seconds);
    assert.ok(speed >= previous); previous = speed;
  }
  assert.equal(flightSpeed(1, 0), 18); assert.equal(flightSpeed(3, SECTOR_SECONDS), 34);
});

test('a barrel roll completes exactly once, with mirrored displacement independent of frame rate', () => {
  for (const direction of [-1, 1]) for (const dt of [1 / 120, 1 / 60, .035]) {
    const roll = new BarrelRoll(); assert.ok(roll.start(direction));
    let lateral = 0, lift = 0, angle = 0;
    for (let i = 0; roll.active && i < 200; i++) { const motion = roll.update(dt); lateral += motion.lateral; lift += motion.lift; angle = motion.angle; }
    assert.ok(Math.abs(lateral - direction * ROLL_DISTANCE) < 1e-8);
    assert.ok(Math.abs(lift) < 1e-8);
    assert.ok(Math.abs(angle + direction * Math.PI * 2) < 1e-8);
    assert.equal(roll.active, false);
    assert.equal(roll.start(-direction), false);
    assert.deepEqual(roll.update(.01), { angle: 0, lateral: 0, lift: 0, bank: 0 });
    roll.update(ROLL_COOLDOWN); assert.ok(roll.start(-direction));
  }
});

test('roll requires a direction; restart clears both rotation and recharge', () => {
  const roll = new BarrelRoll(); assert.equal(roll.start(0), false);
  roll.start(1); roll.update(ROLL_DURATION / 2); roll.reset();
  assert.equal(roll.active, false); assert.equal(roll.cooldown, 0); assert.ok(roll.start(-1));
});

test('left/right plus Space accepts either key order without repeat-triggered rolls', () => {
  for (const [key, direction] of [['KeyA', -1], ['ArrowLeft', -1], ['KeyD', 1], ['ArrowRight', 1]] as const) {
    const keys = new Set([key, 'Space']);
    assert.equal(rollDirection(keys, 'Space', false), direction);
    assert.equal(rollDirection(keys, key, false), direction);
    assert.equal(rollDirection(keys, 'Space', true), 0);
  }
  assert.equal(rollDirection(new Set(['Space']), 'Space', false), 0);
  assert.equal(rollDirection(new Set(['KeyA', 'KeyD', 'Space']), 'Space', false), 0);
  assert.equal(rollDirection(new Set(['KeyD']), 'KeyD', false), 0);
});

test('lightning is a bounded local pulse that settles back to darkness', () => {
  assert.equal(lightningEnvelope(-1), 0); assert.equal(lightningEnvelope(2), 0);
  assert.ok(lightningEnvelope(.2) > .95); assert.ok(lightningEnvelope(.59) > .5);
  for (let age = 0; age < 2; age += .01) assert.ok(lightningEnvelope(age) >= 0 && lightningEnvelope(age) < 1.02);
});

test('storm geometry is reused and reduced motion retains a stable non-flashing formation', () => {
  const storm = new PlanetStorm(), reduced = new PlanetStorm(true);
  const cells = [...storm.root.children];
  const reducedState = reduced.root.children.map(cell => cell.visible);
  for (let i = 0; i < 500; i++) { storm.update(1 / 60); reduced.update(1 / 60); }
  assert.deepEqual(storm.root.children, cells);
  assert.deepEqual(reduced.root.children.map(cell => cell.visible), reducedState);
  assert.equal(reducedState.filter(Boolean).length, 1);
});
