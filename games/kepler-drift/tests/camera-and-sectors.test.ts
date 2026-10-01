import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as T from 'three';
import { StableFlightCamera } from '../src/camera.ts';
import { BarrelRoll, ROLL_DURATION } from '../src/maneuvers.ts';
import { SECTOR_VISUALS, SECTOR_TEXTURE_URLS, sectorVisual } from '../src/sectors.ts';
import { SECTOR_SECONDS, TOTAL_SECTORS } from '../src/state.ts';

test('the full barrel roll leaves camera orientation, height and focal length unchanged',()=>{
  for(const aspect of [1379/750,390/844]) for(const side of [-1,1]) {
    const camera=new T.PerspectiveCamera(59,aspect,.1,1500), rig=new StableFlightCamera(), roll=new BarrelRoll();
    rig.reset(camera); const orientation=camera.quaternion.clone(), y=camera.position.y, fov=camera.fov;
    roll.start(side); let x=0;
    for(let frame=0;frame<240;frame++) {
      x+=roll.update(1/120).lateral;
      rig.update(camera,x,0,1/120);
      assert.ok(camera.quaternion.angleTo(orientation)<1e-7);
      assert.equal(camera.position.y,y); assert.equal(camera.fov,fov);
    }
    assert.equal(roll.active,false); assert.ok(ROLL_DURATION>=1.1);
  }
});

test('fixed framing clears the entire rotating ship above the HUD without pitching during the roll',()=>{
  for(const aspect of [1379/750,960/540,390/844]) for(const direction of [-1,1]) for(const bank of [-.42,.42]) for(const pitch of [-.22,.22]) {
    const camera=new T.PerspectiveCamera(59,aspect,.1,1500),rig=new StableFlightCamera(),ship=new T.Object3D(),roll=new BarrelRoll();
    rig.reset(camera); ship.scale.setScalar(1.04); roll.start(direction);
    for(let frame=0;frame<145;frame++) {
      const motion=roll.update(1/120);
      ship.position.y=roll.height-.65; // Worst allowed camera-follow lag.
      ship.rotation.set(pitch,.16,bank+motion.angle); ship.updateMatrixWorld();
      for(const x of [-4.2,4.2]) for(const y of [-.8,1.1]) for(const z of [-3.8,2.8]) {
        const point=new T.Vector3(x,y,z).applyMatrix4(ship.matrixWorld).project(camera);
        assert.ok((1-point.y)/2<=(aspect<.85?.73:.765)+.002);
      }
    }
  }
});

test('sectors preload distinct planets and retain the original shader sky in the outer belt',()=>{
  assert.equal(new Set(SECTOR_VISUALS.map(v=>v.planet)).size,3);
  assert.equal(new Set(SECTOR_VISUALS.map(v=>v.sky)).size,3);
  assert.equal(SECTOR_TEXTURE_URLS.length,5);
  assert.equal(SECTOR_VISUALS.length,TOTAL_SECTORS);
  assert.equal(new Set(SECTOR_VISUALS.map(v=>JSON.stringify(v))).size,TOTAL_SECTORS);
  assert.equal(SECTOR_VISUALS[0].sky,null);
  for(const url of SECTOR_TEXTURE_URLS) assert.ok(existsSync(new URL('../public'+url,import.meta.url)),url);
  assert.equal(sectorVisual(0),SECTOR_VISUALS[0]); assert.equal(sectorVisual(100),SECTOR_VISUALS[TOTAL_SECTORS-1]);
});

test('a complete six-sector expedition lasts seven minutes thirty seconds',()=>{
  assert.equal(TOTAL_SECTORS,6); assert.equal(SECTOR_SECONDS,75); assert.equal(SECTOR_SECONDS*TOTAL_SECTORS,450);
});
