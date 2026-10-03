import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import type { Rock } from '../src/asteroids.ts';
import type { CombatTarget } from '../src/combat.ts';
import { Projectiles } from '../src/projectiles.ts';
import { MAX_PLAYER_PROJECTILES, PLASMA_RADIUS, SCATTER_PELLETS, SCATTER_RANGE, SEEKER_BLAST_RADIUS } from '../src/weapons.ts';

function rock(x: number, z: number, hp = 100, radius = 1): Rock {
  const root = new T.Group(); root.position.set(x, 0, z);
  return { root, previousPosition: root.position.clone(), radius, hp, maxHp: hp, ore: true, kind: 'normal', spin: new T.Vector3(), wait: 0 };
}
function target(x: number, z: number, kind: CombatTarget['kind'] = 'fighter', hp = 1000): CombatTarget {
  const position = new T.Vector3(x, 0, z);
  return { position, previousPosition: position.clone(), radius: 1.8, hp, maxHp: hp, active: true, kind, label: kind };
}
function muzzles(): T.Object3D[] {
  return [-.45, .45].map(x => { const muzzle = new T.Object3D(); muzzle.position.x = x; return muzzle; });
}
interface ShotView { mesh: T.Mesh; trail: T.Mesh; velocity: T.Vector3; forward: T.Vector3; target: CombatTarget | null; }
function shotsOf(pool: Projectiles): ShotView[] { return (pool as unknown as { shots: ShotView[] }).shots; }

test('plasma proximity fuse catches a near miss that the accurate pulse cannot hit', () => {
  for (const kind of ['pulse', 'plasma'] as const) {
    const shots = new Projectiles(new T.Scene()), asteroid = rock(1.4, -12);
    shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), false, { kind, damage: kind === 'plasma' ? 84 : 14 });
    let impacts = 0;
    shots.update(.2, [asteroid], 999, () => impacts++);
    assert.equal(asteroid.hp, kind === 'plasma' ? 16 : 100);
    assert.equal(impacts, kind === 'plasma' ? 1 : 0);
  }
});

test('the stronger plasma clears a rock cluster, has useful edge damage and never charges its primary twice', () => {
  const shots = new Projectiles(new T.Scene());
  const primary = rock(0, -20, 300), close = rock(4, -20, 40), edge = rock(PLASMA_RADIUS, -20, 100), distant = rock(PLASMA_RADIUS + 4, -20);
  const visits = new Map<Rock, number>(), blasts: string[] = [];
  shots.fire(muzzles(), new T.Vector3(0, 0, -100), false, { kind: 'plasma', damage: 84 });
  assert.equal(shots.count, 1);
  shots.update(.3, [edge, distant, close, primary], 999, asteroid => {
    visits.set(asteroid, (visits.get(asteroid) ?? 0) + 1);
    if (asteroid.hp <= 0) asteroid.wait = 1;
  }, (_position, kind) => blasts.push(kind!));
  assert.equal(primary.hp, 216); assert.equal(visits.get(primary), 1);
  assert.ok(close.hp <= 0); assert.equal(visits.get(close), 1);
  assert.ok(edge.hp <= 79 && edge.hp > 16, 'The outer 9 m area still pays at least 25% damage');
  assert.equal(visits.get(edge), 1); assert.equal(distant.hp, 100); assert.equal(visits.has(distant), false);
  assert.deepEqual(blasts, ['plasma']); assert.equal(shots.count, 0);
  shots.update(1, [primary, close, edge, distant], 999, () => assert.fail('Expired plasma cannot repeat damage'));
});

test('plasma applies one direct hit and one falloff hit per hostile, including lethal callbacks', () => {
  const shots = new Projectiles(new T.Scene()), direct = target(0, -20, 'fighter', 80), neighbor = target(4, -20, 'sniper', 40), distant = target(20, -20, 'fighter', 80);
  const visits = new Map<CombatTarget, number>(), rewards = new Set<CombatTarget>();
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), false, { kind: 'plasma', damage: 84 });
  shots.update(.3, [], 14, () => assert.fail('No asteroid is present'), undefined, undefined, {
    targets: [neighbor, distant, direct],
    hit(enemy, damage) {
      assert.ok(enemy.active, 'No callback to a target already killed by the same blast');
      visits.set(enemy, (visits.get(enemy) ?? 0) + 1); enemy.hp -= damage;
      if (enemy.hp <= 0) { enemy.active = false; rewards.add(enemy); }
    },
  });
  assert.equal(visits.get(direct), 1); assert.equal(direct.hp, -4);
  assert.equal(visits.get(neighbor), 1); assert.ok(neighbor.hp <= 0);
  assert.equal(visits.has(distant), false); assert.equal(rewards.size, 2);
});

test('eight scatter pellets clear the near wall that pulses miss, without multishot multiplying the cone', () => {
  for (const kind of ['pulse', 'scatter'] as const) {
    const shots = new Projectiles(new T.Scene()), left = rock(-3, -18, 20, 1.4), right = rock(3, -18, 20, 1.4);
    shots.fire(muzzles(), new T.Vector3(0, 0, -100), true, { kind, damage: kind === 'scatter' ? 13 : 14 });
    assert.equal(shots.count, kind === 'scatter' ? SCATTER_PELLETS : 6);
    shots.update(.2, [left, right], 14, asteroid => { if (asteroid.hp <= 0) asteroid.wait = 1; });
    if (kind === 'scatter') { assert.ok(left.hp <= 0); assert.ok(right.hp <= 0); }
    else { assert.equal(left.hp, 20); assert.equal(right.hp, 20); }
  }
});

test('scatter expires at 72 m even in a long update, while pulses can still reach that distant rock', () => {
  for (const kind of ['pulse', 'scatter'] as const) {
    const shots = new Projectiles(new T.Scene()), beyond = rock(0, -SCATTER_RANGE - 12, 100, 4);
    shots.fire([new T.Object3D()], beyond.root.position, false, { kind, damage: kind === 'scatter' ? 13 : 14 });
    let hits = 0;
    shots.update(1, [beyond], 14, () => hits++);
    assert.equal(hits, kind === 'scatter' ? 0 : 1);
    assert.equal(shots.count, 0);
  }
});

test('an expired scatter cone cannot hit a rock that enters its old range later in the same frame', () => {
  const shots = new Projectiles(new T.Scene()), approaching = rock(0, -70, 500, 6);
  approaching.previousPosition!.z = -110;
  shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'scatter', damage: 13 });
  shots.update(1, [approaching], 14, () => assert.fail('The rock is still beyond 72 m when the pellets expire'));
  assert.equal(approaching.hp, 500); assert.equal(shots.count, 0);
});

test('two visible warm/green missiles prefer forward pirates and turn at a bounded rate', () => {
  const shots = new Projectiles(new T.Scene()), reactor = target(0, -20, 'reactor'), fighter = target(14, -50), behind = target(0, 10), dead = target(0, -10); dead.active = false;
  shots.fire(muzzles(), new T.Vector3(0, 0, -200), true, { kind: 'seeker', damage: 68, targets: [reactor, behind, dead, fighter] });
  assert.equal(shots.count, 2);
  const original = shotsOf(shots).map(shot => shot.velocity.clone().normalize());
  for (const shot of shotsOf(shots)) {
    assert.equal(shot.target, fighter); assert.equal(shot.trail.visible, true);
    assert.notEqual(shot.mesh.material, shot.trail.material);
    assert.ok(Math.abs(shot.velocity.length() - 100) < 1e-9);
  }
  shots.update(.02, [], 14, () => {});
  for (const [index, shot] of shotsOf(shots).entries()) {
    assert.ok(shot.velocity.x > 0); assert.ok(shot.velocity.z < 0);
    assert.ok(original[index].angleTo(shot.velocity.clone().normalize()) <= 2.6 * .02 + 1e-9);
  }
});

test('missiles follow an off-axis pirate and each deals one direct hit at different frame rates', () => {
  for (const hz of [30, 60, 120]) {
    const shots = new Projectiles(new T.Scene()), enemy = target(15, -60), damage: number[] = [];
    shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'seeker', damage: 68, targets: [enemy] });
    for (let frame = 0; frame < hz * 2 && shots.count; frame++) {
      shots.update(1 / hz, [], 999, () => assert.fail('No rock'), undefined, undefined, {
        targets: [enemy], hit(hit, amount) { damage.push(amount); hit.hp -= amount; },
      });
    }
    assert.deepEqual(damage, [68, 68], `Lost homing or duplicated splash at ${hz} Hz`);
    assert.equal(enemy.hp, 864); assert.equal(shots.count, 0);
  }
});

test('destroyed or passed targets release the lock and missiles never curve back toward the ship', () => {
  for (const loss of ['destroyed', 'behind'] as const) {
    const shots = new Projectiles(new T.Scene()), enemy = target(15, -60);
    shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'seeker', damage: 68, targets: [enemy] });
    shots.update(.04, [], 14, () => {});
    const velocities = shotsOf(shots).map(shot => shot.velocity.clone());
    if (loss === 'destroyed') { enemy.active = false; enemy.hp = 0; }
    else enemy.position.z = 20;
    shots.update(.04, [], 14, () => {});
    for (const [index, shot] of shotsOf(shots).entries()) {
      assert.equal(shot.target, null); assert.ok(shot.velocity.equals(velocities[index])); assert.ok(shot.velocity.z < 0);
    }
  }
});

test('asteroid cover intercepts homing missiles before the pirate and produces only a small missile blast', () => {
  const shots = new Projectiles(new T.Scene()), enemy = target(0, -55), cover = rock(0, -20, 300, 2), blasts: string[] = [];
  const outsideBlast = rock(SEEKER_BLAST_RADIUS + 3, -20);
  shots.fire(muzzles(), enemy.position, false, { kind: 'seeker', damage: 68, targets: [enemy] });
  for (let frame = 0; frame < 120 && shots.count; frame++) shots.update(1 / 60, [cover, outsideBlast], 14, () => {}, (_position, kind) => blasts.push(kind!), undefined,
    { targets: [enemy], hit: () => assert.fail('Cover must absorb the missile before its lock target') });
  assert.equal(cover.hp, 164); assert.equal(outsideBlast.hp, 100); assert.equal(enemy.hp, 1000);
  assert.deepEqual(blasts, ['seeker', 'seeker']); assert.equal(shots.count, 0);
});

test('moving targets cannot cross straight missiles between frames without receiving the swept hit', () => {
  const shots = new Projectiles(new T.Scene()), enemy = target(-4, -10);
  enemy.position.x = 4;
  shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'seeker', damage: 68 });
  const damage: number[] = [];
  shots.update(.2, [], 14, () => {}, undefined, undefined, {
    targets: [enemy], hit(hit, amount) { damage.push(amount); hit.hp -= amount; },
  });
  assert.deepEqual(damage, [68, 68]); assert.equal(enemy.hp, 864); assert.equal(shots.count, 0);
});

test('a closed reactor collision absorbs both missiles before cover behind it and the owner controls its gate', () => {
  const shots = new Projectiles(new T.Scene()), closed = target(0, -20, 'reactor'), behind = rock(0, -35);
  let exposed = false, visits = 0;
  const combat = { targets: [closed], hit(body: CombatTarget, amount: number) { visits++; if (exposed) body.hp -= amount; } };
  shots.fire(muzzles(), closed.position, false, { kind: 'seeker', damage: 68, targets: [] });
  shots.update(.3, [behind], 14, () => assert.fail('The closed body blocks shots into the rock behind it'), undefined, undefined, combat);
  assert.equal(closed.hp, 1000); assert.equal(visits, 2); assert.equal(shots.count, 0);
  exposed = true;
  shots.fire(muzzles(), closed.position, false, { kind: 'seeker', damage: 68, targets: [closed] });
  shots.update(.3, [], 14, () => {}, undefined, undefined, combat);
  assert.equal(closed.hp, 864); assert.equal(visits, 4);
});

test('mixed volleys have a hard reusable pool limit and restart releases every active mesh and lock', () => {
  const scene = new T.Scene(), shots = new Projectiles(scene), enemy = target(10, -50), kinds = ['pulse', 'plasma', 'scatter', 'seeker'] as const;
  for (let salvo = 0; salvo < 100; salvo++) shots.fire(muzzles(), new T.Vector3(0, 0, -200), true, { kind: kinds[salvo % kinds.length], damage: 68, targets: [enemy] });
  assert.equal(shots.count, MAX_PLAYER_PROJECTILES); assert.equal(scene.children.length, MAX_PLAYER_PROJECTILES);
  const originalMeshes = new Set(shotsOf(shots).map(shot => shot.mesh));
  shots.reset(); assert.equal(shots.count, 0); assert.equal(scene.children.length, 0);
  shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'seeker', damage: 68, targets: [enemy] });
  for (const shot of shotsOf(shots)) { assert.ok(originalMeshes.has(shot.mesh)); assert.equal(shot.trail.visible, true); }
  shots.reset();
  shots.fire(muzzles(), new T.Vector3(0, 0, -200), false, { kind: 'pulse', damage: 14 });
  for (const shot of shotsOf(shots)) { assert.ok(originalMeshes.has(shot.mesh)); assert.equal(shot.target, null); assert.equal(shot.trail.visible, false); }
  shots.update(3, [], 14, () => {}); assert.equal(shots.count, 0); assert.equal(scene.children.length, 0);
});
