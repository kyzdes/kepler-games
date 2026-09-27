import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { frameAt,TRACK_LENGTH } from '../src/track.ts';
import { createRockGeometry,placeRocks,distanceToCircuit,SCENERY_CLEARANCE } from '../src/scenery.ts';

test('asteroid volumes clear the entire real circuit, including neighboring bends',()=>{
  const geometry=createRockGeometry(),sphere=geometry.boundingSphere!;
  const radius=sphere.radius+sphere.center.length();
  const fineCircuit=Array.from({length:8193},(_,i)=>frameAt(i/8192*TRACK_LENGTH).position);
  for(const seed of [1792,42,12345,91297]) {
    const rocks=placeRocks(TRACK_LENGTH,frameAt,radius,seed);assert.equal(rocks.length,115);
    for(const rock of rocks) {
      // Independent, 4x denser check against actual centerline samples.
      const nearest=Math.sqrt(Math.min(...fineCircuit.map(p=>p.distanceToSquared(rock.position))));
      assert.ok(nearest-rock.radius>=SCENERY_CLEARANCE-.1,`rock intersects safety corridor, seed ${seed}`);
    }
  }
  geometry.dispose();
});
test('clearance includes the interior of segments and remote adjacent sections',()=>{
  const circuit=[new T.Vector3(0,0,0),new T.Vector3(100,0,0),new T.Vector3(100,0,50),new T.Vector3(0,0,50)];
  assert.equal(distanceToCircuit(new T.Vector3(50,0,49),circuit),1);
});
