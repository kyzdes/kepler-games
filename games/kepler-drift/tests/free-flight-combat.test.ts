import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Projectiles } from '../src/projectiles.ts';
import { CuttingBeam } from '../src/cutting-beam.ts';
import { Salvage } from '../src/salvage.ts';
import { freeFlightQuota, bossScheduled, canAdvanceSector } from '../src/expedition.ts';
import type { Rock } from '../src/asteroids.ts';
import type { CombatTarget } from '../src/combat.ts';

const flipped=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
function asteroid(position:T.Vector3, radius=2): Rock {
  const root=new T.Group(); root.position.copy(position);
  return {root,previousPosition:position.clone(),radius,hp:100,maxHp:100,ore:true,kind:'normal',spin:new T.Vector3(),wait:0};
}

test('every projectile weapon hits after a full turn and a world-space translation',()=>{
  const origin=new T.Vector3(300,80,150), aim=origin.clone().add(new T.Vector3(0,0,40));
  for(const kind of ['pulse','plasma','scatter','seeker'] as const) {
    const scene=new T.Scene(), cannon=new T.Object3D();cannon.position.copy(origin);
    const shots=new Projectiles(scene), rock=asteroid(aim,kind==='scatter'?8:2);
    shots.fire([cannon],aim,false,{kind,damage:14,heading:flipped});
    for(let frame=0;frame<120 && shots.count;frame++) shots.update(1/60,[rock],14,()=>{});
    assert.ok(rock.hp<100,`${kind} still assumes targets must have negative Z`);
  }
});

test('cutter pierces the forward lane after turning back, without cutting behind the cannon',()=>{
  const scene=new T.Scene(), beam=new CuttingBeam(scene), cannon=new T.Object3D();
  cannon.position.set(90,-40,120);
  const near=asteroid(new T.Vector3(90,-40,150)),far=asteroid(new T.Vector3(90,-40,220)),behind=asteroid(new T.Vector3(90,-40,100));
  const hits:Rock[]=[];
  beam.update([cannon],far.root.position,[behind,far,near],rock=>hits.push(rock));
  assert.deepEqual(hits,[near,far]);
});

test('seeker locks and follows the nose direction even when it points along positive Z',()=>{
  const scene=new T.Scene(), shots=new Projectiles(scene), cannon=new T.Object3D();
  cannon.position.set(200,50,300);
  const position=new T.Vector3(207,50,345);
  const target:CombatTarget={position,previousPosition:position.clone(),radius:3,hp:200,maxHp:200,active:true,kind:'fighter',label:'test'};
  shots.fire([cannon],new T.Vector3(200,50,400),false,{kind:'seeker',damage:68,heading:flipped,targets:[target]});
  for(let frame=0;frame<120 && shots.count;frame++) shots.update(1/60,[],14,()=>{},undefined,undefined,{targets:[target],hit(t,damage){t.hp-=damage;}});
  assert.equal(target.hp,64);
});

test('free-space ore at positive world Z stays available and is collected by the tractor',()=>{
  const salvage=new Salvage(new T.Scene(),()=>.5), player=new T.Vector3(120,-20,200);
  salvage.dropReward(player.clone().add(new T.Vector3(0,0,6)),9,2);
  let reward=0;
  for(let frame=0;frame<180 && salvage.count;frame++) salvage.update(1/60,0,player,21,value=>reward+=value,true);
  assert.equal(reward,9);assert.equal(salvage.count,0);
});

test('free-space mining contracts use six increasing quotas and never schedule a corridor boss',()=>{
  assert.deepEqual([1,2,3,4,5,6].map(freeFlightQuota),[40,60,80,100,120,140]);
  for(let sector=1;sector<=6;sector++) assert.equal(bossScheduled(sector,'freeflight'),false);
  assert.equal(canAdvanceSector(1,10000,true,'freeflight'),false);
});
