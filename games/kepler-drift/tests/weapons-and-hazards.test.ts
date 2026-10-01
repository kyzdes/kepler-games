import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { WeaponBattery, CUTTER_DURATION, CUTTER_RECHARGE, cutterRecharge } from '../src/weapons.ts';
import { CuttingBeam } from '../src/cutting-beam.ts';
import { Projectiles } from '../src/projectiles.ts';
import { FlightEffects } from '../src/flight-effects.ts';
import { asteroidKind, blastRadius, blastDamage, SECTOR_HAZARDS } from '../src/hazards.ts';
import type { Rock } from '../src/asteroids.ts';
import { TOTAL_SECTORS } from '../src/state.ts';

function rock(x: number, z: number, kind: Rock['kind'] = 'normal'): Rock {
  const root = new T.Group(); root.position.set(x, 0, z);
  return { root, radius: 1, hp: 100, maxHp: 100, ore: true, kind, spin: new T.Vector3(), wait: 0 };
}

test('switching weapons cannot reset a salvo cooldown or prolong a cutting burst', () => {
  const battery = new WeaponBattery();
  assert.equal(battery.fire(.19, false, true, true), 'pulse');
  battery.select('plasma'); assert.equal(battery.fire(.19, true, false, true), 'plasma');
  battery.select('pulse'); assert.equal(battery.fire(.19, true, false, true), null);
  battery.select('cutter'); assert.equal(battery.fire(.19, true, false, false), 'cutter');
  battery.update(.3); battery.select('plasma');
  assert.equal(battery.remaining, 0); assert.equal(battery.cooldown, CUTTER_RECHARGE);
  battery.select('cutter'); assert.equal(battery.fire(.19, true, false, true), null);
});

test('the beam lasts exactly 1.8 seconds at different frame rates and accounts for excess recharge time', () => {
  for (const hz of [30, 60, 120]) {
    const battery = new WeaponBattery(); battery.select('cutter'); battery.fire(.19, true, false, false);
    for (let frame = 0; frame < hz * CUTTER_DURATION - 1; frame++) battery.update(1 / hz);
    assert.ok(battery.cutting); battery.update(1 / hz);
    assert.equal(battery.remaining, 0); assert.ok(Math.abs(battery.cooldown - CUTTER_RECHARGE) < 1e-8);
    assert.equal(battery.fire(.19, true, false, true), null);
    battery.update(CUTTER_RECHARGE); assert.equal(battery.fire(.19, true, false, true), 'cutter');
  }
  const battery = new WeaponBattery(); battery.select('cutter'); battery.fire(.19, true, false, false);
  battery.update(2); assert.ok(Math.abs(battery.cooldown - 11.8) < 1e-9);
});

test('automatic fire saves the beam for a target; manual fire works without one and restart restores pulses', () => {
  const battery = new WeaponBattery(); battery.select('cutter');
  assert.equal(battery.fire(.19, false, true, false), null);
  assert.equal(battery.fire(.19, false, false, true), null);
  assert.equal(battery.fire(.19, false, true, true), 'cutter');
  battery.reset(); assert.equal(battery.selected, 'pulse'); assert.equal(battery.cooldown, 0); assert.equal(battery.remaining, 0);
});

test('energy upgrades shorten future beam recharge, with a 7.2-second floor', () => {
  assert.equal(cutterRecharge(1), 12); assert.equal(cutterRecharge(2), 11.2); assert.equal(cutterRecharge(100), 7.2);
  const battery = new WeaponBattery(); battery.recharge = cutterRecharge(2); battery.select('cutter'); battery.fire(.19, true, false, false);
  battery.update(1.8); assert.equal(battery.cooldown, 11.2);
});

test('plasma damages the hit and nearby asteroids once, while distant or destroyed asteroids are safe', () => {
  const shots = new Projectiles(new T.Scene());
  const direct = rock(0, -10), neighbor = rock(4, -10), distant = rock(12, -10), hidden = rock(2, -10); hidden.wait = 1;
  shots.fire([new T.Object3D(), new T.Object3D()], new T.Vector3(0, 0, -100), false, { kind: 'plasma', damage: 35 });
  assert.equal(shots.count, 1);
  let hits = 0, blasts = 0;
  shots.update(.2, [neighbor, direct, distant, hidden], 999, () => hits++, () => blasts++);
  assert.equal(direct.hp, 65, 'Damage belongs to the shot fired, not the currently selected gun');
  assert.ok(neighbor.hp < 100 && neighbor.hp > 65); assert.equal(distant.hp, 100); assert.equal(hidden.hp, 100);
  assert.equal(hits, 2); assert.equal(blasts, 1); assert.equal(shots.count, 0);
});

test('a fatal explosion stops collateral damage and the rest of a volley', () => {
  const shots = new Projectiles(new T.Scene()), direct = rock(0, -10), neighbor = rock(3, -10);
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), true, { kind: 'plasma', damage: 35 });
  let alive = true, hits = 0;
  shots.update(.2, [direct, neighbor], 14, () => { hits++; alive = false; }, () => {}, () => alive);
  assert.equal(hits, 1); assert.equal(neighbor.hp, 100);
});

test('the cutter pierces all asteroid kinds in order but misses rocks outside its lane, behind or out of range', () => {
  const beam = new CuttingBeam(new T.Scene()), muzzle = new T.Object3D();
  const near = rock(0, -10), armored = rock(0, -30, 'armored'), volatile = rock(0, -60, 'volatile');
  const miss = rock(4, -20), behind = rock(0, 10), distant = rock(0, -240), hidden = rock(0, -5); hidden.wait = 1;
  const hits: Rock[] = [];
  beam.update([muzzle], new T.Vector3(0, 0, -100), [distant, volatile, hidden, behind, armored, miss, near], hit => {
    hits.push(hit); hit.wait = 2;
  });
  assert.deepEqual(hits, [near, armored, volatile]);
  beam.update([muzzle], new T.Vector3(0, 0, -100), hits, () => assert.fail('Hidden rocks cannot pay a second reward'));
  assert.equal(beam.root.visible, true); beam.hide(); assert.equal(beam.root.visible, false);
});

test('volatile blast damage decreases with distance and never reaches beyond the visible radius', () => {
  for (const radius of [1, 3, 6]) {
    const range = blastRadius(radius);
    assert.ok(blastDamage(radius, 0) > blastDamage(radius, range / 2));
    assert.ok(blastDamage(radius, range / 2) > 0);
    assert.equal(blastDamage(radius, range), 0); assert.equal(blastDamage(radius, range + 10), 0);
  }
});

test('the first sector is safe to learn; later sectors progressively add hazards without eliminating ordinary ore', () => {
  assert.equal(SECTOR_HAZARDS.length, TOTAL_SECTORS);
  for (let roll = 0; roll < 1; roll += .001) assert.equal(asteroidKind(1, roll), 'normal');
  assert.equal(asteroidKind(2, .05), 'volatile'); assert.equal(asteroidKind(3, .22), 'armored');
  let last = 0;
  for (const odds of SECTOR_HAZARDS) { const share = odds.volatile + odds.armored; assert.ok(share >= last && share < .6); last = share; }
});

test('sliced halves borrow geometry and release their clipping materials at expiry or restart', () => {
  const scene = new T.Scene(), effects = new FlightEffects(scene, () => .5);
  const source = new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()); source.updateMatrixWorld();
  let geometryDisposals = 0, sourceDisposals = 0, halfDisposals = 0;
  source.geometry.addEventListener('dispose', () => geometryDisposals++); source.material.addEventListener('dispose', () => sourceDisposals++);
  for (const restart of [false, true]) {
    effects.slice(source, new T.Vector3(), new T.Vector3(0, 0, -1));
    const halves = scene.children.filter(child => child instanceof T.Mesh) as T.Mesh[];
    assert.equal(halves.length, 2);
    for (const half of halves) {
      assert.equal(half.geometry, source.geometry);
      const material = half.material as T.Material;
      assert.notEqual(material, source.material); assert.equal(material.clippingPlanes?.length, 1);
      material.addEventListener('dispose', () => halfDisposals++);
    }
    if (restart) effects.reset(); else effects.update(2);
  }
  assert.equal(geometryDisposals, 0); assert.equal(sourceDisposals, 0); assert.equal(halfDisposals, 4);
  assert.equal(scene.children.length, 1);
});
