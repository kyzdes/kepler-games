import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, damageShip, collectOre, buyUpgrade, upgradeCost, rollUpgrades, mulberry32, segmentSphereHit } from '../src/state.ts';

test('a hit exhausts the shield before damaging the hull, and defeat clamps hull to zero', () => {
  const run = createRun(); run.phase = 'flying';
  damageShip(run, 90); assert.equal(run.shield, 0); assert.equal(run.hull, 85);
  damageShip(run, 200); assert.equal(run.hull, 0); assert.equal(run.phase, 'ended');
});
test('ore pickups add to both spendable ore and the lifetime run result', () => {
  const run = createRun(); collectOre(run, 100); run.phase = 'upgrade';
  assert.equal(buyUpgrade(run, 'laser'), true); assert.equal(run.ore, 45); assert.equal(run.mined, 100);
  assert.ok(run.damage > 14); assert.equal(upgradeCost(run, 'laser'), 80);
});
test('unaffordable purchases cannot produce negative balances or alter a module', () => {
  const run = createRun(); run.phase = 'upgrade'; run.ore = 39;
  const before = structuredClone(run); assert.equal(buyUpgrade(run, 'magnet'), false); assert.deepEqual(run, before);
});
test('purchasing is restricted to the equipment phase', () => {
  const run = createRun(); run.phase = 'flying'; run.ore = 500;
  assert.equal(buyUpgrade(run, 'shield'), false); assert.equal(run.ore, 500);
});
test('repair and shield upgrades respect their capacity and actually restore health', () => {
  const run = createRun(); run.phase = 'upgrade'; run.ore = 300; run.hull = 83; run.shield = 2;
  assert.equal(buyUpgrade(run, 'repair'), true); assert.equal(run.hull, 100); assert.equal(run.shield, 75);
  assert.equal(buyUpgrade(run, 'repair'), false);
  assert.equal(buyUpgrade(run, 'shield'), true); assert.equal(run.maxShield, 100); assert.equal(run.shield, 100);
});
test('multishot cannot be bought twice or offered after installation', () => {
  const run = createRun(); run.phase = 'upgrade'; run.ore = 500;
  assert.equal(buyUpgrade(run, 'multishot'), true); assert.equal(buyUpgrade(run, 'multishot'), false);
  for(let seed = 0; seed < 100; seed++) assert.ok(!rollUpgrades(run, mulberry32(seed)).includes('multishot'));
});
test('every equipment roll has three unique choices and damaged ships get a repair option', () => {
  const run = createRun(); run.hull = 30;
  for(let seed = 0; seed < 100; seed++) { const offer = rollUpgrades(run, mulberry32(seed)); assert.equal(offer.length, 3); assert.equal(new Set(offer).size, 3); assert.ok(offer.includes('repair')); }
});
test('continuous collision detects small asteroids between two fast projectile frames', () => {
  const t = segmentSphereHit(0, 0, 0, 0, 0, -20, 0, 0, -10, 1);
  assert.equal(t, .45);
  assert.equal(segmentSphereHit(0, 0, 0, 0, 0, -20, 4, 0, -10, 1), null);
  assert.equal(segmentSphereHit(0, 0, 0, 0, 0, -20, 0, 0, 10, 1), null);
});
test('collision handles a starting overlap and zero-length movement', () => {
  assert.equal(segmentSphereHit(0, 0, 0, 0, 0, 0, 0, 0, 0, 2), 0);
  assert.equal(segmentSphereHit(0, 0, 0, 0, 0, 0, 5, 0, 0, 2), null);
});
