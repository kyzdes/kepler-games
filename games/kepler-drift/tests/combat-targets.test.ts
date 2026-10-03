import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRock, createShip } from '../src/models.ts';
import type { Rock } from '../src/asteroids.ts';
import type { CombatTarget } from '../src/combat.ts';
import { Projectiles } from '../src/projectiles.ts';
import { CuttingBeam } from '../src/cutting-beam.ts';
import { PirateFleet } from '../src/pirates.ts';
import { MiningBoss, BOSS_TIMINGS } from '../src/mining-boss.ts';
import { blastRadius } from '../src/hazards.ts';

function rock(x: number, z: number, kind: Rock['kind'] = 'normal', y = 0): Rock {
  const root = createRock(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial(), 1, true, 42);
  root.position.set(x, y, z);
  return { root, previousPosition: root.position.clone(), radius: 1, hp: 100, maxHp: 100, ore: true, kind, spin: new T.Vector3(), wait: 0 };
}

/** Real fleet targets retain their model identity and lethal callback behavior. */
function fleetTargets(): { scene: T.Scene; fleet: PirateFleet; enemies: CombatTarget[]; rewards: () => number } {
  const scene = new T.Scene(); let rewards = 0;
  const fleet = new PirateFleet(scene, () => 0, {
    hitPlayer() {}, shot() {}, destroyed(enemy) { rewards++; fleet.hit(enemy, 10000); },
  });
  const ctx = { sector: 4, sectorTime: 0, elapsed: 0, player: new T.Vector3(), worldSpeed: 36, rocks: [], bossActive: false };
  for (let i = 0; i < 60 * 40 && fleet.count < 3; i++) {
    ctx.elapsed += 1 / 60; ctx.sectorTime += 1 / 60; fleet.update(1 / 60, ctx);
  }
  assert.equal(fleet.count, 3);
  return { scene, fleet, enemies: [...fleet.targets], rewards: () => rewards };
}

function place(target: CombatTarget, x: number, z: number, y = 0): void {
  target.position.set(x, y, z); target.previousPosition?.copy(target.position);
}
function pulse(shots: Projectiles, aim: T.Vector3, damage = 14): void {
  shots.fire([new T.Object3D()], aim, false, { kind: 'pulse', damage });
}

test('a pulse chooses the nearest surface across actual asteroid and pirate models, independent of target list order', () => {
  for (const front of ['rock', 'pirate'] as const) {
    const { scene, fleet, enemies } = fleetTargets();
    const enemy = enemies[0], farther = enemies[1];
    place(enemy, 0, front === 'rock' ? -30 : -12); place(farther, 0, -42);
    const asteroid = rock(0, front === 'rock' ? -12 : -30), before = enemy.hp;
    const shots = new Projectiles(scene); pulse(shots, new T.Vector3(0, 0, -100));
    let rocksHit = 0, piratesHit = 0;
    shots.update(.3, [asteroid], 99, () => rocksHit++, undefined, undefined, {
      targets: [farther, enemy], hit(target, damage) { piratesHit++; fleet.hit(target, damage); },
    });
    assert.equal(shots.count, 0);
    assert.equal(rocksHit, front === 'rock' ? 1 : 0); assert.equal(piratesHit, front === 'pirate' ? 1 : 0);
    assert.equal(asteroid.hp, front === 'rock' ? 86 : 100); assert.equal(enemy.hp, front === 'pirate' ? before - 14 : before);
    assert.equal(farther.hp, farther.maxHp);
  }
});

test('stationary targets without movement metadata keep the original first-hit behavior', () => {
  const { scene, fleet, enemies } = fleetTargets(), enemy = enemies[0];
  place(enemy, 0, -30); delete enemy.previousPosition;
  const asteroid = rock(0, -12); delete asteroid.previousPosition;
  const shots = new Projectiles(scene); pulse(shots, enemy.position);
  shots.update(.3, [asteroid], 14, () => {}, undefined, undefined, { targets: [enemy], hit: (target, damage) => fleet.hit(target, damage) });
  assert.equal(asteroid.hp, 86); assert.equal(enemy.hp, enemy.maxHp);
});

test('small rocks moving at full boost cannot tunnel through an opposing pulse at the capped frame delta', () => {
  for (const dt of [.035, 1 / 60, 1 / 120]) {
    const asteroid = rock(0, -12), shots = new Projectiles(new T.Scene());
    pulse(shots, new T.Vector3(0, 0, -100));
    let hits = 0;
    for (let elapsed = 0; elapsed < .2; elapsed += dt) {
      asteroid.previousPosition!.copy(asteroid.root.position);
      asteroid.root.position.z += 135.2 * dt;
      shots.update(dt, [asteroid], 14, () => hits++);
    }
    assert.equal(hits, 1, `Missed a visible crossing at dt=${dt}`); assert.equal(asteroid.hp, 86);
  }
});

test('a pirate crossing the shot lane receives the swept hit even if it ends outside the lane', () => {
  const { scene, fleet, enemies } = fleetTargets(), enemy = enemies[0];
  place(enemy, -4, -10);
  enemy.previousPosition!.copy(enemy.position); enemy.position.x = 4;
  const shots = new Projectiles(scene); pulse(shots, new T.Vector3(0, 0, -100));
  let hits = 0;
  shots.update(.125, [], 14, () => assert.fail('There is no rock'), undefined, undefined, {
    targets: [enemy], hit(target, damage) { hits++; fleet.hit(target, damage); },
  });
  assert.equal(hits, 1); assert.equal(enemy.hp, enemy.maxHp - 14);
});

test('plasma pays direct damage once and area damage once to nearby pirates and rocks, while distant targets are safe', () => {
  const { scene, fleet, enemies } = fleetTargets(); const [direct, neighbor, distant] = enemies;
  place(direct, 0, -20); place(neighbor, 4, -20); place(distant, 20, -20);
  const asteroid = rock(6, -20), shots = new Projectiles(scene), visits = new Map<CombatTarget, number>();
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), false, { kind: 'plasma', damage: 35 });
  let blasts = 0, rockHits = 0;
  shots.update(.3, [asteroid], 14, () => rockHits++, () => blasts++, undefined, {
    targets: [distant, neighbor, direct], hit(target, damage) { visits.set(target, (visits.get(target) ?? 0) + 1); fleet.hit(target, damage); },
  });
  assert.equal(direct.hp, direct.maxHp - 35); assert.equal(visits.get(direct), 1);
  assert.ok(neighbor.hp < neighbor.maxHp && neighbor.hp > neighbor.maxHp - 35); assert.equal(visits.get(neighbor), 1);
  assert.equal(distant.hp, distant.maxHp); assert.equal(visits.has(distant), false);
  assert.ok(asteroid.hp < 100); assert.equal(rockHits, 1); assert.equal(blasts, 1); assert.equal(shots.count, 0);
  shots.update(.3, [asteroid], 14, () => assert.fail('An expired plasma cannot pay twice'));
});

test('a volatile impact can destroy a pirate before plasma collateral without paying the reward twice', () => {
  const { scene, fleet, enemies, rewards } = fleetTargets(), enemy = enemies[0];
  place(enemy, 0, -16);
  const volatile = rock(0, -10, 'volatile'), shots = new Projectiles(scene);
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), false, { kind: 'plasma', damage: 35 });
  let collateral = 0;
  shots.update(.3, [volatile], 14, asteroid => {
    asteroid.wait = 1; asteroid.root.visible = false;
    fleet.blast(asteroid.root.position, blastRadius(asteroid.radius), 10000);
  }, undefined, undefined, { targets: [enemy], hit(target, damage) { collateral++; fleet.hit(target, damage); } });
  assert.equal(enemy.active, false); assert.equal(rewards(), 1); assert.equal(collateral, 0); assert.equal(shots.count, 0);
});

test('a fatal volatile impact stops plasma collateral to live pirates and the rest of the volley', () => {
  const { scene, fleet, enemies } = fleetTargets(), enemy = enemies[0]; place(enemy, 0, -16);
  const volatile = rock(0, -10, 'volatile'), shots = new Projectiles(scene);
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), true, { kind: 'plasma', damage: 35 });
  let alive = true, impacts = 0;
  shots.update(.3, [volatile], 14, asteroid => { impacts++; asteroid.wait = 1; alive = false; }, undefined, () => alive,
    { targets: [enemy], hit: (target, damage) => fleet.hit(target, damage) });
  assert.equal(impacts, 1); assert.equal(enemy.hp, enemy.maxHp); assert.equal(enemy.active, true);
});

test('the two real ship muzzles cut through cover but apply one DPS tick to each pirate per update', () => {
  const { scene, fleet, enemies } = fleetTargets(); const [near, far, outside] = enemies;
  place(near, 0, -20); place(far, 0, -50); place(outside, 12, -30);
  const ship = createShip(), beam = new CuttingBeam(scene), asteroid = rock(0, -12);
  const visits = new Map<CombatTarget, number>(); let cuts = 0;
  const combat = { targets: [far, outside, near], hit(target: CombatTarget, damage: number) { visits.set(target, (visits.get(target) ?? 0) + 1); fleet.hit(target, damage); } };
  beam.update(ship.muzzles, new T.Vector3(0, 0, -100), [asteroid], hit => { cuts++; hit.wait = 1; }, undefined, combat, 3);
  assert.equal(cuts, 1); assert.equal(visits.get(near), 1); assert.equal(visits.get(far), 1); assert.equal(visits.has(outside), false);
  assert.equal(near.hp, near.maxHp - 3); assert.equal(far.hp, far.maxHp - 3);
  beam.update(ship.muzzles, new T.Vector3(0, 0, -100), [asteroid], () => assert.fail('Hidden cover cannot be cut twice'), undefined, combat, 3);
  assert.equal(visits.get(near), 2); assert.equal(near.hp, near.maxHp - 6);
});

test('several projectiles and a later cutter cannot pay another reward for a dead fleet target', () => {
  const { scene, fleet, enemies, rewards } = fleetTargets(), enemy = enemies[0]; place(enemy, 0, -20);
  fleet.hit(enemy, enemy.hp - 20);
  const shots = new Projectiles(scene), combat = { targets: [enemy], hit: (target: CombatTarget, damage: number) => fleet.hit(target, damage) };
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), true, { kind: 'pulse', damage: 14 });
  shots.update(.3, [], 14, () => {}, undefined, undefined, combat);
  assert.equal(enemy.active, false); assert.equal(enemy.hp, 0); assert.equal(rewards(), 1);
  new CuttingBeam(scene).update(createShip().muzzles, new T.Vector3(0, 0, -100), [], () => {}, undefined, combat, 1000);
  shots.update(2, [], 14, () => {}, undefined, undefined, combat);
  assert.equal(rewards(), 1); assert.equal(shots.count, 0);
});

test('the closed boss body absorbs shots using the same target identity that later becomes damageable', () => {
  const scene = new T.Scene(); let rewards = 0;
  const boss = new MiningBoss(scene, { hitPlayer() {}, shot() {}, destroyed() { rewards++; } });
  boss.spawn(3); boss.update(.01, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  const body = boss.bodyTarget!, point = body.position.clone(), asteroid = rock(point.x, point.z - 30, 'normal', point.y);
  body.previousPosition?.copy(body.position);
  const muzzle = new T.Object3D(); muzzle.position.set(point.x, point.y, 0);
  const shots = new Projectiles(scene), combat = { targets: [body], hit: (target: CombatTarget, damage: number) => boss.hit(target, damage) };
  shots.fire([muzzle], point, false, { kind: 'pulse', damage: 1000 });
  shots.update(.9, [asteroid], 14, () => assert.fail('A closed body shields the rock behind it'), undefined, undefined, combat);
  assert.equal(body.hp, body.maxHp); assert.equal(asteroid.hp, 100); assert.equal(shots.count, 0); assert.equal(rewards, 0);
  boss.update(7, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  assert.equal(boss.target,null); assert.equal(boss.reactorOpening,true);
  boss.hit(body,10000); assert.equal(body.hp,body.maxHp);
  boss.update(BOSS_TIMINGS.opening, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  assert.equal(boss.target, body); body.previousPosition?.copy(body.position);
  for(let opening=1;opening<=3;opening++) {
    shots.fire([muzzle], body.position, true, { kind: 'plasma', damage: 1000 });
    shots.update(.9, [], 14, () => {}, undefined, undefined, combat);
    if(opening<3) {
      assert.equal(boss.defeated,false); assert.equal(rewards,0); assert.equal(boss.reactorOpen,false);
      assert.ok(Math.abs(body.hp-body.maxHp*(1-opening*.37))<1e-6);
      boss.update(BOSS_TIMINGS.closing+BOSS_TIMINGS.warning+BOSS_TIMINGS.firing+BOSS_TIMINGS.recovery+BOSS_TIMINGS.opening,
        {player:new T.Vector3(20,0,0),rocks:[],worldSpeed:32});
      body.previousPosition?.copy(body.position);assert.equal(boss.reactorOpen,true);
    }
  }
  assert.equal(body.active, false); assert.equal(boss.defeated, true); assert.equal(rewards, 1);
  shots.update(2, [], 14, () => {}, undefined, undefined, combat); boss.reset();
  assert.equal(rewards, 1); assert.equal(boss.bodyTarget, null);
});
