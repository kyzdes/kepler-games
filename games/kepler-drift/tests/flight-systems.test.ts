import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Projectiles } from '../src/projectiles.ts';
import { Salvage } from '../src/salvage.ts';
import { FlightEffects } from '../src/flight-effects.ts';
import type { Rock } from '../src/asteroids.ts';
import { asteroidOre, collectOre, createRun, mulberry32 } from '../src/state.ts';

function rock(z: number, hp = 30, wait = 0): Rock {
  const root = new T.Group();
  root.position.z = z;
  return { root, radius: 1, hp, maxHp: hp, ore: true, spin: new T.Vector3(), wait };
}

test('a fast shot hits the nearest active asteroid once, regardless of array order', () => {
  const scene = new T.Scene(), shots = new Projectiles(scene);
  const near = rock(-6), far = rock(-23), hidden = rock(-3, 30, 1);
  shots.fire([new T.Object3D()], new T.Vector3(0, 0, -100), false);
  const hits: { rock: Rock; point: T.Vector3 }[] = [];
  shots.update(.2, [far, hidden, near], 14, (rock, point) => hits.push({ rock, point: point.clone() }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rock, near);
  assert.ok(Math.abs(hits[0].point.z - (-6 + .93)) < 1e-9);
  assert.equal(near.hp, 16);
  assert.equal(far.hp, 30);
  assert.equal(hidden.hp, 30);
  assert.equal(shots.count, 0);
  assert.equal(scene.children.length, 0);
  shots.update(.2, [near], 14, () => assert.fail('A consumed shot cannot damage twice'));
});

test('a destroyed asteroid cannot receive another kill from the same volley', () => {
  const shots = new Projectiles(new T.Scene()), target = rock(-6, 14);
  shots.fire([new T.Object3D(), new T.Object3D()], new T.Vector3(0, 0, -100), false);
  let kills = 0;
  shots.update(.2, [target], 14, hit => {
    if (hit.hp <= 0) { kills++; hit.wait = 1.2; hit.root.visible = false; }
  });
  assert.equal(kills, 1);
  assert.equal(target.hp, 0);
  assert.equal(shots.count, 1);
});

test('multishot emits three lasers per muzzle; expiry and restart remove every mesh', () => {
  const scene = new T.Scene(), shots = new Projectiles(scene);
  const muzzles = [new T.Object3D(), new T.Object3D()];
  muzzles[0].position.x = -1; muzzles[1].position.x = 1;
  const aim = new T.Vector3(0, 0, -100);
  shots.fire(muzzles, aim, true);
  assert.equal(shots.count, 6);
  assert.equal(scene.children.length, 6);
  shots.update(1.9, [], 14, () => assert.fail('An empty field has no hits'));
  assert.equal(shots.count, 0);
  assert.equal(scene.children.length, 0);
  shots.fire(muzzles, aim, false);
  assert.equal(shots.count, 2);
  shots.reset(); shots.reset();
  assert.equal(scene.children.length, 0);
  assert.equal(shots.count, 0);
});

test('a full salvage pool preserves all rewards and a sector transfer collects them exactly once', () => {
  const scene = new T.Scene(), salvage = new Salvage(scene, mulberry32(37)), run = createRun();
  let expected = 0;
  for (let i = 0; i < 100; i++) {
    const radius = 1 + i % 6, rich = i % 4 !== 3;
    expected += asteroidOre(radius, rich);
    salvage.drop(new T.Vector3(i % 4, 0, -30), radius, rich);
  }
  assert.equal(salvage.count, 150);
  assert.equal(salvage.drops.reduce((sum, drop) => sum + drop.value, 0), expected);
  salvage.collectAll(value => collectOre(run, value));
  salvage.collectAll(() => assert.fail('A transferred reward cannot be collected twice'));
  assert.equal(run.ore, expected);
  assert.equal(run.mined, expected);
  assert.equal(salvage.count, 0);
  assert.equal(scene.children.length, 0);
});

test('the magnet moves real crystals into the ship and credits each reward once', () => {
  const scene = new T.Scene(), salvage = new Salvage(scene, () => .5), run = createRun();
  salvage.drop(new T.Vector3(0, 0, -20), 3, true);
  let pickups = 0;
  for (let frame = 0; frame < 180; frame++) {
    salvage.update(1 / 60, 18, new T.Vector3(), run.magnet, value => { pickups++; collectOre(run, value); });
  }
  assert.equal(pickups, 3);
  assert.equal(run.ore, asteroidOre(3, true));
  assert.equal(run.mined, run.ore);
  assert.equal(salvage.count, 0);
  assert.equal(scene.children.length, 0);
});

test('expired or restarted salvage is removed without awarding phantom ore', () => {
  const scene = new T.Scene(), salvage = new Salvage(scene, () => .5);
  salvage.drop(new T.Vector3(0, 0, -10), 2, true);
  salvage.update(19, 0, new T.Vector3(1000, 0, 0), 21, () => assert.fail('Remote salvage cannot be picked up'));
  assert.equal(salvage.count, 0);
  salvage.drop(new T.Vector3(0, 0, -10), 2, true);
  salvage.reset();
  salvage.collectAll(() => assert.fail('Restart does not carry ore into the new run'));
  assert.equal(scene.children.length, 0);
});

test('explosions stay bounded and restart clears the visible particles and shared fragments', () => {
  const scene = new T.Scene(), effects = new FlightEffects(scene, mulberry32(11));
  const source = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
  let disposals = 0;
  source.geometry.addEventListener('dispose', () => disposals++);
  source.material.addEventListener('dispose', () => disposals++);
  effects.burst(new T.Vector3(), new T.Color(1, .5, .1), 2000, 9);
  for (let i = 0; i < 30; i++) effects.shatter(source, new T.Vector3(), 3);
  effects.update(0);
  const points = scene.children.find(child => child instanceof T.Points) as T.Points;
  assert.equal(points.geometry.drawRange.count, 950);
  assert.equal(scene.children.filter(child => child instanceof T.Mesh).length, 80);
  effects.reset();
  assert.equal(points.geometry.drawRange.count, 0);
  assert.equal(scene.children.length, 1);
  assert.equal(disposals, 0, 'Fragments borrow geometry and materials from reusable rocks');
  effects.burst(new T.Vector3(), new T.Color(1, .5, .1), 10, 9);
  effects.shatter(source, new T.Vector3(), 3);
  effects.update(3);
  assert.equal(points.geometry.drawRange.count, 0);
  assert.equal(scene.children.length, 1);
});
