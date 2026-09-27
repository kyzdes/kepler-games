import test from 'node:test';
import assert from 'node:assert/strict';
import { BoostDrive, BOOST_DURATION, boostEnvelope } from '../src/boost.ts';
import { createRun, collectOre, buyUpgrade, upgradeCost } from '../src/state.ts';

test('boost lasts six seconds and then recharges without a second overlapping burn',()=>{
  for(const hz of [30,60,144]) {
    const drive=new BoostDrive(); assert.ok(drive.start());
    for(let i=0;i<hz*5;i++) drive.update(1/hz,4.5);
    assert.ok(drive.remaining>.99 && drive.remaining<1.01); assert.equal(drive.cooldown,0); assert.equal(drive.start(),false);
    for(let i=0;i<hz+1;i++) drive.update(1/hz,4.5);
    assert.equal(drive.remaining,0); assert.ok(drive.cooldown>4.45 && drive.cooldown<=4.5); assert.equal(drive.start(),false);
    drive.update(4.5,4.5); assert.ok(drive.start()); assert.equal(drive.remaining,BOOST_DURATION);
  }
});
test('a frame crossing the end of boost accounts for only the leftover recharge time',()=>{
  const drive=new BoostDrive(); drive.start(); drive.update(6.2,3);
  assert.ok(Math.abs(drive.cooldown-2.8)<1e-8);
  drive.reset(); assert.equal(drive.remaining,0); assert.equal(drive.cooldown,0);
});
test('peripheral blur eases in and out without a brightness flash or a permanent tail',()=>{
  assert.equal(boostEnvelope(6),0); assert.equal(boostEnvelope(3),1); assert.equal(boostEnvelope(0),0);
  assert.ok(boostEnvelope(5.9)>0 && boostEnvelope(5.9)<1);
  assert.ok(boostEnvelope(.1)>0 && boostEnvelope(.1)<1);
});
test('collected ore buys weapon upgrades in the armory and preserves the mined total',()=>{
  const run=createRun(); collectOre(run,180); run.phase='armory';
  assert.ok(buyUpgrade(run,'laser')); assert.equal(run.ore,125); assert.equal(run.levels.laser,2);
  assert.ok(Math.abs(run.damage-18.9)<1e-8); assert.equal(upgradeCost(run,'laser'),80);
  assert.ok(buyUpgrade(run,'multishot')); assert.equal(run.ore,25); assert.equal(run.mined,180); assert.ok(run.multishot);
  const before=structuredClone(run); assert.equal(buyUpgrade(run,'laser'),false); assert.equal(buyUpgrade(run,'multishot'),false); assert.deepEqual(run,before);
});
test('the armory cannot buy non-weapon modules and flight cannot buy anything',()=>{
  const run=createRun(); run.phase='armory'; run.ore=500;
  for(const id of ['engine','magnet','shield','repair'] as const) assert.equal(buyUpgrade(run,id),false);
  run.phase='flying'; assert.equal(buyUpgrade(run,'laser'),false); assert.equal(buyUpgrade(run,'multishot'),false); assert.equal(run.ore,500);
});
