import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShipCollider } from '../src/collision.ts';
import { EnemyProjectiles } from '../src/enemy-projectiles.ts';
import { PirateFleet } from '../src/pirates.ts';
import type { PirateContext } from '../src/pirates.ts';
import { ATTACK_LOCK, advancePirateAttack, damagePirate, firstEnemyImpact, MAX_ENEMY_SHOTS, MAX_PIRATES, piratePressure, shouldSpawnPirate, SNIPER_WINDUP } from '../src/pirate-rules.ts';
import type { PirateAttackClock, ShotCover } from '../src/pirate-rules.ts';

function cover(x: number, z: number, radius = 2): ShotCover {
  const position = new T.Vector3(x, 0, z);
  return { position, previous: position.clone(), radius, active: true };
}
function context(sector = 1): PirateContext {
  return { sector, sectorTime: 0, elapsed: 0, player: new T.Vector3(), worldSpeed: 18, rocks: [], bossActive: false };
}
function fly(fleet: PirateFleet, state: PirateContext, seconds: number, hz = 60): void {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const dt = Math.min(1 / hz, remaining);
    state.elapsed += dt; state.sectorTime += dt; fleet.update(dt, state); remaining -= dt;
  }
}

test('pressure leaves fourteen seconds to learn and stays capped for arbitrarily deep runs', () => {
  assert.equal(shouldSpawnPirate(1, 13.999, 0, 0, false), false);
  assert.equal(shouldSpawnPirate(1, 14, 0, 0, false), true);
  assert.equal(shouldSpawnPirate(1, 14, 2, 0, false), false);
  assert.equal(shouldSpawnPirate(6, 90, 0, 0, true), false);
  assert.equal(shouldSpawnPirate(6, 90, 0, .001, false), false);
  let prior = piratePressure(1);
  for (const sector of [2, 3, 4, 5, 6, 10, 100, 10_000]) {
    const next = piratePressure(sector);
    assert.ok(next.limit >= prior.limit && next.limit <= MAX_PIRATES);
    assert.ok(next.interval <= prior.interval && next.interval >= 6.5);
    prior = next;
  }
  assert.deepEqual(piratePressure(NaN), piratePressure(1));
});

test('sniper locks before firing and gives its full 1.5-second warning at every frame rate', () => {
  for (const hz of [30, 60, 120]) {
    const clock: PirateAttackClock = { phase: 'cooldown', remaining: 0, shotsLeft: 0 };
    assert.equal(advancePirateAttack(clock, 'sniper', 1 / hz), ATTACK_LOCK);
    assert.equal(clock.remaining, SNIPER_WINDUP);
    for (let frame = 0; frame < hz * SNIPER_WINDUP - 1; frame++) assert.equal(advancePirateAttack(clock, 'sniper', 1 / hz), 0);
    assert.equal(advancePirateAttack(clock, 'sniper', 1 / hz) >> 1, 1);
    assert.equal(clock.phase, 'cooldown');
    assert.ok(clock.remaining >= 5);
  }
  const clock: PirateAttackClock = { phase: 'cooldown', remaining: .1, shotsLeft: 0 };
  assert.equal(advancePirateAttack(clock, 'sniper', 10), ATTACK_LOCK, 'A long frame cannot consume a new warning');
  assert.equal(clock.remaining, SNIPER_WINDUP);
});

test('fighters give an initial warning, exactly three spaced bolts and a recovery interval', () => {
  const clock: PirateAttackClock = { phase: 'cooldown', remaining: 0, shotsLeft: 0 };
  assert.equal(advancePirateAttack(clock, 'fighter', .01), ATTACK_LOCK);
  assert.equal(advancePirateAttack(clock, 'fighter', .799), 0);
  assert.equal(advancePirateAttack(clock, 'fighter', .001) >> 1, 1);
  assert.equal(advancePirateAttack(clock, 'fighter', .179), 0);
  assert.equal(advancePirateAttack(clock, 'fighter', .001) >> 1, 1);
  assert.equal(advancePirateAttack(clock, 'fighter', .18) >> 1, 1);
  assert.equal(clock.phase, 'cooldown');
  assert.equal(advancePirateAttack(clock, 'fighter', 3), 0);
  assert.equal(advancePirateAttack(clock, 'fighter', 0), 0);
});

test('damage invalidates a lethal pirate before rewards and rejects repeat or invalid damage', () => {
  const enemy = { hp: 40, active: true };
  assert.equal(damagePirate(enemy, 0), 'none');
  assert.equal(damagePirate(enemy, Infinity), 'none');
  assert.equal(damagePirate(enemy, 14), 'hit'); assert.equal(enemy.hp, 26);
  assert.equal(damagePirate(enemy, 26), 'destroyed'); assert.equal(enemy.active, false); assert.equal(enemy.hp, 0);
  assert.equal(damagePirate(enemy, 100), 'none');
});

test('the first asteroid absorbs a swept shot; a rock behind the hull cannot shield it', () => {
  const from = new T.Vector3(0, 0, -20), to = new T.Vector3(0, 0, 20), player = new T.Vector3();
  const front = cover(0, -8), behind = cover(0, 8);
  assert.equal(firstEnemyImpact(from, to, player, player, [behind, front], .12)?.kind, 'cover');
  assert.equal(firstEnemyImpact(from, to, player, player, [behind], .12)?.kind, 'player');
  front.active = false;
  assert.equal(firstEnemyImpact(from, to, player, player, [front], .12)?.kind, 'player');
  const far = cover(5, -8);
  assert.equal(firstEnemyImpact(from, to, player, player, [far], .12)?.kind, 'player');
});

test('relative sweeps catch moving cover and lateral ship movement between rendered frames', () => {
  const from = new T.Vector3(0, 0, -10), to = new T.Vector3(0, 0, 10);
  const moving = cover(8, 0, 1); moving.previous.x = -8;
  const farPlayer = new T.Vector3(100, 0, 0);
  assert.equal(firstEnemyImpact(from, to, farPlayer, farPlayer, [moving], .12)?.kind, 'cover');
  assert.equal(firstEnemyImpact(from, to, new T.Vector3(-8, 0, 0), new T.Vector3(8, 0, 0), [], .12)?.kind, 'player');
});

test('hostile bolts hit once at 30/60/120 Hz, respect the compound hull and are blocked without damaging cover', () => {
  for (const hz of [30, 60, 120]) {
    const shots = new EnemyProjectiles(new T.Scene()), player = new T.Vector3();
    const origin = new T.Vector3(0, 0, -50);
    let damage = 0;
    shots.fire(origin, player, 'fighter', 1);
    for (let i = 0; i < hz * 2; i++) shots.update(1 / hz, { player, previousPlayer: player, covers: [] }, amount => damage += amount);
    assert.equal(damage, 11); assert.equal(shots.count, 0);
  }
  const shots = new EnemyProjectiles(new T.Scene()), player = new T.Vector3();
  const ship = new T.Object3D(); ship.updateMatrixWorld();
  const collider = new ShipCollider(); collider.setMotion(ship.matrixWorld, ship.matrixWorld);
  const intersectsPlayer = (from: T.Vector3, to: T.Vector3, radius: number) => collider.intersectsRock(from, to, radius);
  const origin = new T.Vector3(4, 0, -20), aim = new T.Vector3(4, 0, 0);
  let hits = 0;
  shots.fire(origin, aim, 'fighter', 1);
  shots.update(.5, { player, previousPlayer: player, covers: [], intersectsPlayer }, () => hits++);
  assert.equal(hits, 1, 'Visible wings receive a hit outside the central fallback sphere');
  const rock = cover(4, -8, 1), before = JSON.stringify(rock);
  shots.fire(origin, aim, 'fighter', 1);
  shots.update(.5, { player, previousPlayer: player, covers: [rock], intersectsPlayer }, () => hits++);
  assert.equal(hits, 1, 'Cover shields the wing'); assert.equal(JSON.stringify(rock), before);
});

test('shot meshes are reused and the hard cap holds even if all enemies fire together', () => {
  const scene = new T.Scene(), shots = new EnemyProjectiles(scene);
  const origin = new T.Vector3(0, 0, -100), aim = new T.Vector3();
  const ids = scene.children.map(child => child.uuid);
  let fired = 0;
  for (let i = 0; i < 100; i++) if (shots.fire(origin, aim, 'fighter', 6)) fired++;
  assert.equal(fired, MAX_ENEMY_SHOTS); assert.equal(shots.count, MAX_ENEMY_SHOTS);
  assert.equal(scene.children.length, MAX_ENEMY_SHOTS);
  shots.reset(); assert.equal(shots.count, 0); assert.ok(scene.children.every(child => !child.visible));
  assert.equal(shots.fire(origin, aim, 'sniper', 6), true);
  assert.deepEqual(scene.children.map(child => child.uuid), ids);
});

test('the fleet respects onboarding, pays one reward under reentrant damage and reset pays none', () => {
  let rewards = 0;
  const state = context();
  const fleet = new PirateFleet(new T.Scene(), () => .5, {
    hitPlayer() {}, shot() {}, destroyed(enemy) { rewards++; fleet.hit(enemy, 1000); fleet.blast(enemy.position, 20, 1000); },
  });
  fly(fleet, state, 13.9); assert.equal(fleet.count, 0); assert.equal(fleet.shotCount, 0);
  fly(fleet, state, .2); assert.equal(fleet.count, 1);
  const enemy = fleet.targets[0]; assert.equal(enemy.kind, 'fighter'); assert.equal(enemy.position, fleet.enemies[0].root.position);
  fleet.hit(enemy, 14); assert.equal(rewards, 0); assert.equal(enemy.hp, 42);
  fleet.hit(enemy, 1000); assert.equal(rewards, 1); assert.equal(enemy.active, false);
  fleet.hit(enemy, 1000); assert.equal(rewards, 1);
  fly(fleet, state, 13); assert.ok(fleet.count > 0);
  fleet.reset(); assert.equal(fleet.count, 0); assert.equal(fleet.shotCount, 0); assert.equal(rewards, 1);
});

test('a sniper visibly telegraphs a frozen aim, a dodge avoids it, and a boss clears threats without rewards', () => {
  const scene = new T.Scene(), state = context(2);
  let fired = 0, hits = 0, rewards = 0;
  const fleet = new PirateFleet(scene, () => 0, { hitPlayer() { hits++; }, shot() { fired++; }, destroyed() { rewards++; } });
  fly(fleet, state, 14.1);
  const sniper = fleet.enemies.find(enemy => enemy.active); assert.ok(sniper); assert.equal(sniper.kind, 'sniper');
  for (let i = 0; i < 360 && !sniper.charging; i++) fly(fleet, state, 1 / 60);
  assert.equal(sniper.charging, true); assert.equal(fired, 0);
  assert.ok(scene.children.some(child => child instanceof T.Line && child.visible));
  const locked = sniper.lockedAim.clone(); state.player.x = 12;
  fly(fleet, state, 1.49); assert.equal(fired, 0); assert.ok(sniper.lockedAim.equals(locked));
  fly(fleet, state, .03); assert.equal(fired, 1); assert.equal(sniper.charging, false); assert.equal(fleet.shotCount, 1);
  fly(fleet, state, 1.5); assert.equal(hits, 0, 'The shot follows its old aim, not the dodging player');
  for (let i = 0; i < 600 && fleet.shotCount === 0; i++) fly(fleet, state, 1 / 60);
  assert.ok(fleet.shotCount > 0, 'Boss transition is checked with an actual live hostile bolt');
  state.bossActive = true; fleet.update(.01, state);
  assert.equal(fleet.count, 0); assert.equal(fleet.shotCount, 0); assert.equal(rewards, 0);
  assert.ok(scene.children.filter(child => child instanceof T.Line).every(child => !child.visible));
});

test('a local explosion hurts nearby pirates, spares distant ones, and pays its lethal reward once', () => {
  const state = context(); let rewards = 0;
  const fleet = new PirateFleet(new T.Scene(), () => .5, { hitPlayer() {}, shot() {}, destroyed() { rewards++; } });
  fly(fleet, state, 26.5); assert.equal(fleet.count, 2);
  const [near, far] = fleet.targets;
  const origin = near.position.clone(), farHp = far.hp;
  assert.ok(origin.distanceTo(far.position) > 20);
  fleet.blast(origin, 20, 10); assert.equal(near.hp, near.maxHp - 10); assert.equal(far.hp, farHp);
  fleet.blast(origin, 20, 1000); assert.equal(rewards, 1); assert.equal(near.active, false); assert.equal(far.active, true);
  fleet.blast(origin, 20, 1000); assert.equal(rewards, 1);
});

test('deep sectors keep pressure and allocations bounded while zero time cannot advance combat', () => {
  const scene = new T.Scene(), state = context(1000);
  let shots = 0;
  const fleet = new PirateFleet(scene, () => .2, { hitPlayer() {}, shot() { shots++; }, destroyed() {} });
  const childCount = scene.children.length;
  let peak = 0;
  for (let i = 0; i < 60 * 120; i++) {
    fly(fleet, state, 1 / 60);
    peak = Math.max(peak, fleet.count);
    assert.ok(fleet.count <= MAX_PIRATES); assert.ok(fleet.shotCount <= MAX_ENEMY_SHOTS);
  }
  assert.ok(peak > 1); assert.ok(shots > 20); assert.equal(scene.children.length, childCount);
  const before = fleet.enemies.map(enemy => ({ age: enemy.age, remaining: enemy.attack.remaining, position: enemy.position.toArray() }));
  fleet.update(0, state);
  assert.deepEqual(fleet.enemies.map(enemy => ({ age: enemy.age, remaining: enemy.attack.remaining, position: enemy.position.toArray() })), before);
});
