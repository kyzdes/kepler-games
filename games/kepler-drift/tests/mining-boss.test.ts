import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import type { Rock } from '../src/asteroids.ts';
import { BossBattery, BOSS_TIMINGS, BOSS_CUTTER_DPS, bossMaxHealth, bossLaneDistance, bossLaneEnd, MiningBoss } from '../src/mining-boss.ts';

function rock(x: number, y: number, z: number, radius = 2): Rock {
  const root = new T.Group(); root.position.set(x, y, z);
  return { root, radius, hp: 100, maxHp: 100, ore: true, kind: 'normal', spin: new T.Vector3(), wait: 0 };
}
function open(battery: BossBattery): void {
  battery.update(BOSS_TIMINGS.approach + BOSS_TIMINGS.warning + BOSS_TIMINGS.firing + BOSS_TIMINGS.recovery);
}

test('a boss visibly warns for 1.6 seconds before the first attack at all ordinary frame rates', () => {
  for (const hz of [30, 60, 120]) {
    const battery = new BossBattery(); battery.spawn(3);
    let warningFrame = -1, fireFrame = -1;
    for (let frame = 0; frame < hz * 5; frame++) {
      const events = battery.update(1 / hz);
      if (events.includes('warning')) warningFrame = frame;
      if (events.includes('fire')) { fireFrame = frame; break; }
    }
    assert.ok(warningFrame >= 0); assert.ok(Math.abs((fireFrame - warningFrame) / hz - 1.6) < 1 / hz);
  }
});

test('only exposed windows take damage; a 1.8-second cutter is useful without instantly killing a full boss', () => {
  const battery = new BossBattery(); battery.spawn(3);
  battery.hit(10000); assert.equal(battery.hp, 820);
  open(battery); assert.equal(battery.exposed, true);
  battery.hit(BOSS_CUTTER_DPS * 1.8); assert.equal(battery.hp, 496); assert.equal(battery.defeated, false);
  battery.update(3.999); assert.equal(battery.exposed, true);
  battery.update(.001); assert.equal(battery.exposed, false);
  battery.hit(10000); assert.equal(battery.hp, 496);
  assert.equal(battery.hit(NaN), false); assert.equal(battery.hit(-100), false);
});

test('boss health is capped and a fatal hit is emitted once, while reset pays no kill', () => {
  assert.equal(bossMaxHealth(3), 820); assert.equal(bossMaxHealth(6), 1100); assert.equal(bossMaxHealth(9), 1380);
  assert.equal(bossMaxHealth(999999), 1380);
  const battery = new BossBattery(); battery.spawn(6); open(battery);
  assert.equal(battery.hit(2000), true); assert.equal(battery.hp, 0); assert.equal(battery.hit(2000), false);
  assert.deepEqual(battery.update(60), []); assert.equal(battery.defeated, true);
  battery.reset(); assert.equal(battery.active, false); assert.equal(battery.defeated, false);
  battery.spawn(3); assert.equal(battery.hp, 820);
});

test('pause and zero delta freeze the encounter clock instead of consuming the opening', () => {
  const battery = new BossBattery(); battery.spawn(3); open(battery);
  const before = { phase: battery.phase, remaining: battery.remaining, hp: battery.hp };
  battery.update(0); battery.update(-2); battery.update(NaN);
  assert.deepEqual({ phase: battery.phase, remaining: battery.remaining, hp: battery.hp }, before);
  battery.update(BOSS_TIMINGS.exposed + BOSS_TIMINGS.closing);
  assert.equal(battery.phase, 'warning'); assert.equal(battery.remaining, 1.6);
});

test('attack lanes use a swept path, so fast dodges through a fired beam do not tunnel', () => {
  const from = new T.Vector3(0, 0, -65), end = new T.Vector3(0, 0, 16);
  assert.equal(bossLaneDistance(from, end, new T.Vector3(-10, 0, 0), new T.Vector3(10, 0, 0)), 0);
  assert.equal(bossLaneDistance(from, end, new T.Vector3(4, 0, 0), new T.Vector3(4, 0, 0)), 4);
  assert.equal(bossLaneDistance(from, end, new T.Vector3(0, 0, 20), new T.Vector3(0, 0, 30)), 4);
});

test('the nearest living asteroid provides cover; hidden or destroyed rocks cannot stop a boss beam', () => {
  const from = new T.Vector3(0, 0, -65), end = new T.Vector3(0, 0, 16);
  const near = rock(0, 0, -40), far = rock(0, 0, -10), offLane = rock(8, 0, -50);
  const blocked = bossLaneEnd(from, end, [far, offLane, near]);
  assert.ok(Math.abs(blocked.z - (-40 - near.radius * .93)) < 1e-8);
  near.wait = 1; assert.ok(bossLaneEnd(from, end, [near, far]).z < -10);
  far.hp = 0; assert.equal(bossLaneEnd(from, end, [near, far]).z, 16);
});

test('the rendered reactor reports its actual world-space target and shares one body identity', () => {
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() {}, destroyed() {}, shot() {} });
  boss.spawn(3); assert.equal(boss.target, null); assert.ok(boss.bodyTarget);
  const body = boss.bodyTarget!;
  boss.root.position.set(13, -4, -70); boss.root.rotation.z = .3;
  boss.update(.01, { player: new T.Vector3(), rocks: [], worldSpeed: 32 });
  const expected = boss.model.reactor.getWorldPosition(new T.Vector3());
  assert.ok(body.position.distanceTo(expected) < 1e-9);
  assert.notEqual(body.position.z, boss.model.reactor.position.z);
  boss.update(BOSS_TIMINGS.approach + BOSS_TIMINGS.warning + BOSS_TIMINGS.firing + BOSS_TIMINGS.recovery, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  assert.equal(boss.reactorOpen, true); assert.equal(boss.target, boss.bodyTarget);
  boss.hit(body, 100); assert.equal(body.hp, 720); assert.equal(boss.health, 720 / 820);
});

test('a boss destruction callback occurs once and reset does not grant another reward', () => {
  let kills = 0;
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() {}, destroyed() { kills++; }, shot() {} });
  boss.spawn(3); const target = boss.bodyTarget!;
  boss.hit(target, 2000); assert.equal(kills, 0);
  boss.update(7, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  boss.hit(target, 2000); boss.hit(target, 2000);
  assert.equal(kills, 1); assert.equal(boss.target, null); assert.equal(boss.bodyTarget, null);
  assert.equal(boss.root.visible, false); assert.equal(boss.defeated, true);
  boss.reset(); assert.equal(kills, 1); assert.equal(boss.defeated, false);
});

test('player movement after telegraph avoids the fixed lane, and cover stops damage', () => {
  for (const useCover of [false, true]) {
    let hits = 0;
    const boss = new MiningBoss(new T.Scene(), { hitPlayer() { hits++; }, destroyed() {}, shot() {} });
    boss.spawn(3);
    const player = new T.Vector3(0, 0, 0);
    const rocks = useCover ? [rock(0, 0, -18, 7)] : [];
    boss.update(3, { player, rocks, worldSpeed: 32 });
    // Move during the warning and stay away for the frame that starts the shot.
    player.x = useCover ? 0 : 12;
    boss.update(1.5, { player, rocks, worldSpeed: 32 });
    boss.update(.1, { player, rocks, worldSpeed: 32 });
    assert.equal(hits, 0);
  }
});

test('each firing lane can hurt once per burst and uses the actual hull callback when supplied', () => {
  let hits = 0, checks = 0, shots = 0;
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() { hits++; }, destroyed() {}, shot() { shots++; } });
  const ctx = { player: new T.Vector3(), rocks: [], worldSpeed: 32, intersectsPlayer() { checks++; return true; } };
  boss.spawn(3); boss.update(3, ctx); boss.update(1.6, ctx); boss.update(.05, ctx); boss.update(.05, ctx);
  assert.equal(hits, 1); assert.equal(checks, 1); assert.equal(shots, 1);
  boss.reset(); assert.equal(boss.active, false); boss.update(10, ctx); assert.equal(hits, 1);
});

test('reactor blast damage respects the open window and visible explosion distance', () => {
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() {}, destroyed() {}, shot() {} });
  boss.spawn(3);
  const body = boss.bodyTarget!;
  boss.blast(body.position, 7, 100); assert.equal(body.hp, 820);
  boss.update(7, { player: new T.Vector3(20, 0, 0), rocks: [], worldSpeed: 32 });
  boss.blast(body.position.clone().add(new T.Vector3(20, 0, 0)), 7, 100); assert.equal(body.hp, 820);
  boss.blast(body.position, 7, 100); assert.equal(body.hp, 720);
});

test('repeated spawns reuse the same model and two attack lines without adding scene children', () => {
  const scene = new T.Scene(), boss = new MiningBoss(scene, { hitPlayer() {}, destroyed() {}, shot() {} });
  const model = boss.root, count = scene.children.length;
  for (let sector = 3; sector <= 60; sector += 3) {
    boss.spawn(sector); boss.update(4.6, { player: new T.Vector3(), rocks: [], worldSpeed: 52 }); boss.reset();
    assert.equal(boss.root, model); assert.equal(scene.children.length, count);
  }
});
