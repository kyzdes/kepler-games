import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import type { Rock } from '../src/asteroids.ts';
import { BossBattery, BOSS_TIMINGS, BOSS_CUTTER_DPS, BOSS_OPENING_DAMAGE_FRACTION, bossMaxHealth, bossLaneDistance, bossLaneEnd, MiningBoss } from '../src/mining-boss.ts';

function rock(x: number, y: number, z: number, radius = 2): Rock {
  const root = new T.Group(); root.position.set(x, y, z);
  return { root, radius, hp: 100, maxHp: 100, ore: true, kind: 'normal', spin: new T.Vector3(), wait: 0 };
}
function open(battery: BossBattery): void {
  for (let phase = 0; phase < 8 && !battery.exposed; phase++) battery.update(battery.remaining);
  assert.equal(battery.exposed, true);
}
const BEFORE_OPENING = BOSS_TIMINGS.approach + BOSS_TIMINGS.warning + BOSS_TIMINGS.firing + BOSS_TIMINGS.recovery;
const ctx = { player: new T.Vector3(20, 0, 0), rocks: [] as Rock[], worldSpeed: 32 };
function openModel(boss: MiningBoss): void {
  for (let phase = 0; phase < 8 && !boss.reactorOpen; phase++) boss.update(boss.battery.remaining, ctx);
  assert.equal(boss.reactorOpen, true);
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
  battery.hit(10000); assert.equal(battery.hp, 1800);
  open(battery); assert.equal(battery.exposed, true);
  battery.hit(BOSS_CUTTER_DPS * 1.8); assert.equal(battery.hp, 1476); assert.equal(battery.defeated, false);
  battery.update(3.999); assert.equal(battery.exposed, true);
  battery.update(.001); assert.equal(battery.exposed, false);
  battery.hit(10000); assert.equal(battery.hp, 1476);
  assert.equal(battery.hit(NaN), false); assert.equal(battery.hit(-100), false);
});

test('boss health is bounded; even an enormous salvo needs three genuine openings and pays one kill', () => {
  assert.equal(bossMaxHealth(3), 1800); assert.equal(bossMaxHealth(6), 2400); assert.equal(bossMaxHealth(9), 3000);
  assert.equal(bossMaxHealth(12), 3600); assert.equal(bossMaxHealth(999999), 3600);
  assert.equal(bossMaxHealth(NaN), 1800); assert.equal(bossMaxHealth(-10), 1800);
  const battery = new BossBattery(); battery.spawn(6);
  for (let opening = 1; opening <= 3; opening++) {
    open(battery); assert.equal(battery.openings, opening);
    assert.equal(battery.shutterAmount, 1);
    assert.equal(battery.hit(Number.MAX_VALUE), opening === 3);
    if (opening < 3) {
      assert.equal(battery.overloaded, true); assert.equal(battery.exposed, false);
      assert.equal(battery.hp, battery.maxHp * (1 - BOSS_OPENING_DAMAGE_FRACTION * opening));
      battery.hit(Number.MAX_VALUE); assert.equal(battery.defeated, false);
    }
  }
  assert.equal(battery.hp, 0); assert.equal(battery.hit(2000), false);
  assert.deepEqual(battery.update(60), []); assert.equal(battery.defeated, true);
  battery.reset(); assert.equal(battery.active, false); assert.equal(battery.defeated, false);
  assert.equal(battery.openings, 0); assert.equal(battery.openingDamage, 0);
  battery.spawn(3); assert.equal(battery.hp, 1800); assert.equal(battery.overloaded, false);
});

test('the 0.65-second shutter animation is entirely armored and opening starts only once the doors reach their end', () => {
  const battery = new BossBattery(); battery.spawn(3);
  assert.deepEqual(battery.update(BEFORE_OPENING), ['warning', 'fire', 'opening']);
  assert.equal(battery.phase, 'opening'); assert.equal(battery.shutterAmount, 0); assert.equal(battery.openings, 0);
  battery.hit(10000); assert.equal(battery.hp, 1800);
  battery.update(BOSS_TIMINGS.opening / 2);
  assert.equal(battery.shutterAmount, .5); assert.equal(battery.exposed, false);
  battery.hit(10000); assert.equal(battery.hp, 1800);
  battery.update(BOSS_TIMINGS.opening / 2 - .0001);
  assert.ok(battery.shutterAmount < 1); assert.equal(battery.exposed, false);
  assert.deepEqual(battery.update(.0001), ['open']);
  assert.equal(battery.shutterAmount, 1); assert.equal(battery.exposed, true); assert.equal(battery.openings, 1);
});

test('consecutive shots, beam ticks and explosions share one opening damage budget in the same frame', () => {
  const battery = new BossBattery(); battery.spawn(3); open(battery);
  const budget = battery.openingDamageLimit;
  for (const damage of [280, 180 / 60, 100, 600, 100, Number.MAX_VALUE]) battery.hit(damage);
  assert.equal(battery.openingDamage, budget); assert.equal(battery.hp, battery.maxHp - budget);
  assert.equal(battery.phase, 'closing'); assert.equal(battery.overloaded, true);
  const hp = battery.hp;
  battery.update(0); battery.hit(10000); battery.update(.0001); battery.hit(10000);
  assert.equal(battery.hp, hp); assert.equal(battery.exposed, false); assert.ok(battery.shutterAmount < 1);
  open(battery); assert.equal(battery.openingDamage, 0); assert.equal(battery.overloaded, false);
  battery.hit(100); assert.equal(battery.hp, hp - 100);
});

test('an unupgraded twin pulse battery takes four early openings and five late openings', () => {
  for (const [sector, expected] of [[3, 4], [6, 5]]) {
    const battery = new BossBattery(); battery.spawn(sector);
    while (!battery.defeated) {
      open(battery);
      // Twenty-one paired salvos can land during the four-second window.
      for (let shot = 0; shot < Math.floor(BOSS_TIMINGS.exposed / .19); shot++) battery.hit(14 * 2);
      if (!battery.defeated) battery.update(battery.remaining);
    }
    assert.equal(battery.openings, expected);
  }
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
  openModel(boss);
  assert.equal(boss.reactorOpen, true); assert.equal(boss.target, boss.bodyTarget);
  boss.hit(body, 100); assert.equal(body.hp, 1700); assert.equal(boss.health, 1700 / 1800);
});

test('the rendered shutters, glow and target stay protected through opening and signal overload immediately', () => {
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() {}, destroyed() {}, shot() {} });
  boss.spawn(3); const body = boss.bodyTarget!;
  boss.update(BEFORE_OPENING, ctx);
  assert.equal(boss.reactorOpening, true); assert.equal(boss.target, null); assert.match(boss.warning, /раскрывается/);
  for (const shutter of boss.model.shutters) assert.equal(shutter.position.x, shutter.userData.closedX);
  boss.update(BOSS_TIMINGS.opening / 2, ctx); boss.hit(body, 10000); boss.blast(body.position, 7, 10000);
  assert.equal(body.hp, 1800); assert.equal(boss.reactorOpen, false);
  for (const shutter of boss.model.shutters) {
    assert.equal(shutter.position.x, Number(shutter.userData.closedX) + Number(shutter.userData.side) * 2.1);
  }
  boss.update(BOSS_TIMINGS.opening / 2, ctx);
  assert.equal(boss.reactorOpen, true); assert.equal(boss.target, body); assert.equal(boss.model.reactorGlow.material.color.getHex(), 0x69e8ff);
  for (const shutter of boss.model.shutters) {
    assert.equal(shutter.position.x, Number(shutter.userData.closedX) + Number(shutter.userData.side) * 4.2);
  }
  boss.hit(body, 10000);
  assert.equal(boss.reactorOverloaded, true); assert.equal(boss.target, null); assert.match(body.label, /ПЕРЕГРУЖЕН/);
  assert.match(boss.warning, /перегружен/); assert.equal(boss.model.reactorGlow.material.color.getHex(), 0xff7045);
  const hp = body.hp;
  boss.blast(body.position, 7, 10000); boss.hit(body, 10000); assert.equal(body.hp, hp);
  boss.update(BOSS_TIMINGS.closing / 2, ctx);
  for (const shutter of boss.model.shutters) {
    assert.equal(shutter.position.x, Number(shutter.userData.closedX) + Number(shutter.userData.side) * 2.1);
  }
});

test('a boss destruction callback occurs once and reset does not grant another reward', () => {
  let kills = 0;
  const boss = new MiningBoss(new T.Scene(), { hitPlayer() {}, destroyed() { kills++; }, shot() {} });
  boss.spawn(3); const target = boss.bodyTarget!;
  boss.hit(target, 2000); assert.equal(kills, 0);
  for (let opening = 0; opening < 3; opening++) {
    openModel(boss); boss.hit(target, 10000); boss.hit(target, 10000);
  }
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
  boss.blast(body.position, 7, 100); assert.equal(body.hp, 1800);
  openModel(boss);
  boss.blast(body.position.clone().add(new T.Vector3(20, 0, 0)), 7, 100); assert.equal(body.hp, 1800);
  boss.blast(body.position, 7, 100); assert.equal(body.hp, 1700);
});

test('repeated spawns reuse the same model and two attack lines without adding scene children', () => {
  const scene = new T.Scene(), boss = new MiningBoss(scene, { hitPlayer() {}, destroyed() {}, shot() {} });
  const model = boss.root, count = scene.children.length;
  for (let sector = 3; sector <= 60; sector += 3) {
    boss.spawn(sector); boss.update(4.6, { player: new T.Vector3(), rocks: [], worldSpeed: 52 }); boss.reset();
    assert.equal(boss.root, model); assert.equal(scene.children.length, count);
  }
});
