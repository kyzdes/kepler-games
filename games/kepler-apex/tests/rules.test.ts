import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace, standings, advanceDriver, LAPS, PADS, formatTime, wrap } from '../src/rules.ts';

const neutral={steer:0,throttle:true,brake:false,boost:false};
function running(){const r=createRace();r.phase='racing';r.drivers[0].distance=50;r.drivers.slice(1).forEach((d,i)=>d.distance=500+i*20);return r;}
test('menu and pause freeze the race, including charge and opponents',()=>{
  for(const phase of ['menu','paused','finished'] as const){const r=createRace();r.phase=phase;const before=structuredClone(r);stepRace(r,neutral,.1,2000,()=>0);assert.deepEqual(r,before);}
});
test('countdown has no racing time and transitions to running',()=>{
  const r=createRace();r.phase='countdown';r.countdown=.01;stepRace(r,neutral,.02,2000,()=>0);assert.equal(r.phase,'racing');assert.equal(r.elapsed,0);assert.equal(r.drivers[0].distance,-52);
});
test('braking decelerates while automatic throttle is on and prevents boost',()=>{
  const r=running();r.drivers[0].speed=100;stepRace(r,{...neutral,brake:true,boost:true},.1,2000,()=>0);assert.ok(r.drivers[0].speed<91);assert.equal(r.boosting,false);
});
test('ordinary acceleration cannot creep above the base speed limit',()=>{
  const r=running();r.drivers[0].speed=108;r.drivers[0].lane=9;
  for(let i=0;i<120;i++)stepRace(r,neutral,1/120,2000,()=>0);
  assert.equal(r.drivers[0].speed,108);
  r.drivers[0].speed=145;stepRace(r,neutral,.1,2000,()=>0);assert.ok(r.drivers[0].speed<142);
});
test('exhausted boost locks until 25 percent and never yields negative energy',()=>{
  const r=running();r.drivers[0].speed=90;r.energy=.1;stepRace(r,{...neutral,boost:true},.02,2000,()=>0);assert.equal(r.energy,0);assert.equal(r.boostLocked,true);
  stepRace(r,{...neutral,boost:true},.1,2000,()=>0);assert.equal(r.boosting,false);assert.ok(r.energy>0);
  r.energy=25;stepRace(r,{...neutral,boost:true},.01,2000,()=>0);assert.equal(r.boostLocked,false);assert.equal(r.boosting,true);
});
test('a swept pad crossing awards once, only in the correct lane',()=>{
  for(const match of [true,false]){
    const r=running();r.energy=40;r.drivers[0].distance=PADS[0].fraction*2000-1;r.drivers[0].lane=match?PADS[0].lane:8;r.drivers[0].speed=100;
    stepRace(r,neutral,.02,2000,()=>0);assert.equal(r.pads,match?1:0);
    stepRace(r,neutral,.02,2000,()=>0);assert.equal(r.pads,match?1:0);
  }
});
test('contact with rails clamps position and removes speed once per cooldown',()=>{
  const r=running();r.drivers[0].speed=100;r.drivers[0].lane=10.89;r.lateralSpeed=25;
  stepRace(r,{...neutral,steer:1},1/120,2000,()=>0);assert.equal(r.hits,1);assert.ok(r.drivers[0].speed<80);assert.ok(r.drivers[0].lane<=10.9);assert.ok(r.lateralSpeed<0);
  stepRace(r,{...neutral,steer:1},.1,2000,()=>0);assert.equal(r.hits,1);
});
test('steering counteracts outward drift on a right-hand bend',()=>{
  const drifting=running(),steering=running();drifting.drivers[0].speed=100;steering.drivers[0].speed=100;
  for(let i=0;i<60;i++){stepRace(drifting,neutral,1/120,2000,()=>-.004);stepRace(steering,{...neutral,steer:1},1/120,2000,()=>-.004);}
  assert.ok(drifting.drivers[0].lane<-4);assert.ok(steering.drivers[0].lane>-4);
});
test('crossing the starting line is not a completed lap',()=>{
  const r=running();r.drivers[0].distance=-.1;r.drivers[0].speed=80;stepRace(r,neutral,.02,2000,()=>0);assert.equal(r.lapTimes.length,0);
});
test('lap and finish clocks interpolate the actual line crossing',()=>{
  const r=running();r.elapsed=90;r.lapStarted=60;r.lapTimes=[30,30];r.drivers[0].distance=5999;r.drivers[0].speed=100;
  stepRace(r,neutral,.02,2000,()=>0);assert.equal(r.phase,'finished');assert.equal(r.drivers[0].distance,6000);assert.equal(r.lapTimes.length,3);assert.ok(r.elapsed>90&&r.elapsed<90.02);assert.ok(Math.abs(r.lapTimes.reduce((a,b)=>a+b,0)-r.elapsed)<1e-8);
});
test('finished drivers retain finish order and do not receive fabricated times',()=>{
  const r=createRace();r.drivers[1].distance=LAPS*2000;r.drivers[1].finishTime=90;r.drivers[0].distance=LAPS*2000;r.drivers[0].finishTime=91;
  const sorted=standings(r);assert.equal(sorted[0].id,1);assert.equal(sorted[1].id,0);assert.equal(sorted[2].finishTime,null);
  advanceDriver(r.drivers[1],200,2000,200,1);assert.equal(r.drivers[1].finishTime,90);
});
test('a full race terminates, and a new race clears all run state',()=>{
  const r=running();let ticks=0;while(r.phase==='racing'&&ticks++<20000)stepRace(r,neutral,1/120,1800,()=>0);
  assert.equal(r.phase,'finished');assert.equal(r.lapTimes.length,3);assert.ok(r.elapsed>45&&r.elapsed<100);
  const fresh=createRace();assert.equal(fresh.phase,'menu');assert.equal(fresh.energy,100);assert.equal(fresh.elapsed,0);assert.deepEqual(fresh.lapTimes,[]);assert.equal(fresh.hits,0);
});
test('time formatting and wrapping remain stable at boundaries',()=>{assert.equal(formatTime(61.237),'01:01.23');assert.equal(formatTime(Infinity),'—');assert.equal(wrap(-1,2000),1999);});
