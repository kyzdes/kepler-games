import test from 'node:test';
import assert from 'node:assert/strict';
import { createDynamics,stepVehicle } from '../src/physics.ts';
import { createRace,stepRace } from '../src/rules.ts';
import { TRACK_LENGTH,curvatureAt } from '../src/track.ts';

const cruise={steer:0,throttle:true,brake:false,boost:false};
function vehicle(speed=95){return {body:{speed,lane:0},state:createDynamics()};}
function drive(v:ReturnType<typeof vehicle>,input=cruise,seconds=.5,bend=0,dt=1/120){
  for(let t=0;t<seconds-dt/2;t+=dt)stepVehicle(v.body,v.state,input,dt,bend,108,false);
}
test('releasing steering preserves lateral momentum before the tires settle',()=>{
  const v=vehicle();drive(v,{...cruise,steer:.8});const before=v.state.lateralSpeed;
  assert.ok(before>5);drive(v,cruise,.05);assert.ok(v.state.lateralSpeed>before*.7);
  drive(v,cruise,1);assert.ok(Math.abs(v.state.lateralSpeed)<before*.25);
});
test('handbrake breaks rear grip and creates more slip than an ordinary turn',()=>{
  const grip=vehicle(),slide=vehicle();
  drive(grip,{...cruise,steer:1},.55);drive(slide,{...cruise,steer:1,handbrake:true} as typeof cruise,.55);
  assert.ok(slide.state.slip>grip.state.slip+.15);
  assert.ok(slide.body.speed<grip.body.speed-10);
  assert.ok(Math.abs(slide.state.heading)>Math.abs(grip.state.heading));
});
test('the same corner exceeds grip at high speed but is controllable after braking',()=>{
  const slow=vehicle(50),fast=vehicle(108);
  drive(slow,cruise,.35,-.01);drive(fast,cruise,.35,-.01);
  assert.ok(Math.abs(fast.body.lane)>Math.abs(slow.body.lane)*4);
  assert.ok(fast.state.slip>slow.state.slip);
});
test('glancing wall scrapes lose less forward speed than hard sideways impacts',()=>{
  const speeds=[4,24].map(lateralSpeed=>{
    const r=createRace();r.phase='racing';r.drivers[0].speed=100;r.drivers[0].lane=10.899;r.lateralSpeed=lateralSpeed;
    stepRace(r,cruise,1/120,2000,()=>0);assert.ok(r.lateralSpeed<0);return r.drivers[0].speed;
  });
  assert.ok(speeds[0]>93);assert.ok(speeds[0]-speeds[1]>12);
});
test('steering integration is stable across simulation step sizes',()=>{
  const a=vehicle(),b=vehicle();drive(a,{...cruise,steer:.7},1,0,1/120);drive(b,{...cruise,steer:.7},1,0,1/240);
  assert.ok(Math.abs(a.body.lane-b.body.lane)<.14);
  assert.ok(Math.abs(a.state.heading-b.state.heading)<.005);
});
test('the actual circuit remains finishable and all dynamic values stay finite',()=>{
  const r=createRace();r.phase='racing';let ticks=0;
  while(r.phase==='racing'&&ticks++<120*210)stepRace(r,cruise,1/120,TRACK_LENGTH,curvatureAt);
  assert.equal(r.phase,'finished');assert.equal(r.lapTimes.length,3);
  for(const value of [r.elapsed,r.heading,r.yawRate,r.lateralSpeed,r.drivers[0].speed])assert.ok(Number.isFinite(value));
});
