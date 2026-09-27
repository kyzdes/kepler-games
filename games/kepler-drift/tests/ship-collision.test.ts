import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ShipCollider } from '../src/collision.ts';

function stationaryShip(): { ship: T.Object3D; collider: ShipCollider } {
  const ship = new T.Object3D(); ship.scale.setScalar(1.04); ship.updateMatrixWorld();
  const collider = new ShipCollider(); collider.setMotion(ship.matrixWorld, ship.matrixWorld);
  return { ship, collider };
}

test('the visible nose, wings and engines receive hits outside the old central hit sphere', () => {
  const { collider } = stationaryShip();
  for (const [x, y, z] of [[0, 0, -4.1], [-4.15, .25, 1.9], [4.15, .25, 1.9], [-2, .1, 2.7], [2, .1, 2.7]]) {
    const rock = new T.Vector3(x, y, z);
    assert.ok(collider.intersectsRock(rock, rock, .6), `Solid ship contact missed at ${rock.toArray()}`);
  }
});

test('empty space around swept wings and engine exhaust cannot damage the ship', () => {
  const { collider } = stationaryShip();
  for (const [x, y, z] of [[6.5, 0, 2], [3.9, 0, -3], [-3.9, 0, -3], [0, 3, 0], [1.67, .04, 5]]) {
    const rock = new T.Vector3(x, y, z);
    assert.equal(collider.intersectsRock(rock, rock, .65), false, `False contact at ${rock.toArray()}`);
  }
});

test('collision follows the banked, translated ship instead of a world-aligned body', () => {
  const { ship, collider } = stationaryShip();
  ship.position.set(9, -4, 0); ship.rotation.set(-.18, .12, -.65); ship.updateMatrixWorld();
  collider.setMotion(ship.matrixWorld, ship.matrixWorld);
  const wingContact = new T.Vector3(4.1, .2, 1.9).applyMatrix4(ship.matrixWorld);
  assert.ok(collider.intersectsRock(wingContact, wingContact, .5));
  assert.equal(collider.intersectsRock(new T.Vector3(), new T.Vector3(), .5), false);
});

test('fast asteroids and lateral ship movement cannot tunnel through the collision body', () => {
  const { ship, collider } = stationaryShip();
  assert.ok(collider.intersectsRock(new T.Vector3(4.15, .25, -12), new T.Vector3(4.15, .25, 12), .6));
  assert.equal(collider.intersectsRock(new T.Vector3(7, 0, -12), new T.Vector3(7, 0, 12), .6), false);
  ship.position.x = -8; ship.updateMatrixWorld(); const from = ship.matrixWorld.clone();
  ship.position.x = 8; ship.updateMatrixWorld(); collider.setMotion(from, ship.matrixWorld);
  assert.ok(collider.intersectsRock(new T.Vector3(), new T.Vector3(), .6));
});
