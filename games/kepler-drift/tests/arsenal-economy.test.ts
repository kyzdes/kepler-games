import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, collectOre, buyWeapon, canBuyWeapon, buyUpgrade, upgradeMaxed, rollUpgrades } from '../src/state.ts';
import { WeaponBattery, WEAPONS, BASE_FIRE_INTERVAL, MAX_ENERGY_LEVEL, weaponDamage } from '../src/weapons.ts';
import type { WeaponId } from '../src/weapons.ts';

const unlockPrices = { plasma:90, scatter:140, seeker:220, cutter:320 } as const;

test('a fresh expedition starts with only impulses and does not inherit another run inventory', () => {
  const first = createRun('endless'); first.phase='armory'; collectOre(first,320);
  assert.deepEqual(first.unlockedWeapons,{pulse:true,plasma:false,scatter:false,seeker:false,cutter:false});
  assert.ok(buyWeapon(first,'cutter'));
  assert.equal(createRun().unlockedWeapons.cutter,false);
  assert.equal(first.unlockedWeapons.pulse,true);
});

test('every paid weapon has a fixed price and exact ore boundary without repeat charges', () => {
  for (const [id,price] of Object.entries(unlockPrices) as [keyof typeof unlockPrices,number][]) {
    const run=createRun(); run.phase='armory'; collectOre(run,price-1);
    assert.equal(WEAPONS[id].cost,price);
    const before=structuredClone(run);
    assert.equal(canBuyWeapon(run,id),false); assert.equal(buyWeapon(run,id),false); assert.deepEqual(run,before);
    collectOre(run,1); assert.equal(canBuyWeapon(run,id),true); assert.ok(buyWeapon(run,id));
    assert.equal(run.ore,0); assert.equal(run.mined,price); assert.equal(run.unlockedWeapons[id],true);
    const bought=structuredClone(run); assert.equal(buyWeapon(run,id),false); assert.deepEqual(run,bought);
  }
});

test('all four openings cost 770 ore in total and do not change the mined record', () => {
  const run=createRun(); run.phase='upgrade'; collectOre(run,770);
  for (const id of Object.keys(unlockPrices) as WeaponId[]) assert.ok(buyWeapon(run,id));
  assert.equal(run.ore,0); assert.equal(run.mined,770);
  assert.ok(Object.values(run.unlockedWeapons).every(Boolean));
  assert.equal(buyWeapon(run,'pulse'),false);
});

test('weapon transactions require the protected bay or sector workshop', () => {
  for (const phase of ['ready','flying','paused','ended'] as const) {
    const run=createRun(); run.phase=phase; collectOre(run,1000);
    assert.equal(buyWeapon(run,'seeker'),false); assert.equal(run.ore,1000);
    assert.equal(run.unlockedWeapons.seeker,false);
  }
  for (const phase of ['armory','upgrade'] as const) {
    const run=createRun(); run.phase=phase; collectOre(run,220); assert.ok(buyWeapon(run,'seeker'));
  }
});

test('invalid balances cannot create a weapon or spend a non-finite amount', () => {
  for (const ore of [NaN,Infinity,-1]) {
    const run=createRun();run.phase='armory';run.ore=ore;
    assert.equal(buyWeapon(run,'plasma'),false);assert.equal(run.unlockedWeapons.plasma,false);
  }
});

test('energy level has a hard cap and maxed equipment is not offered or charged again', () => {
  const run=createRun();run.phase='armory';collectOre(run,10000);
  for(let i=1;i<MAX_ENERGY_LEVEL;i++) assert.ok(buyUpgrade(run,'laser'));
  assert.equal(run.levels.laser,5);assert.ok(upgradeMaxed(run,'laser'));
  assert.ok(Math.abs(run.damage-14*1.35**4)<1e-8);
  const before=structuredClone(run);assert.equal(buyUpgrade(run,'laser'),false);assert.deepEqual(run,before);
  assert.equal(rollUpgrades(run,()=>.5).includes('laser'),false);
});

test('energy upgrades strengthen all purchased weapon roles from the same power rule', () => {
  const run=createRun();run.phase='armory';collectOre(run,55);assert.ok(buyUpgrade(run,'laser'));
  for(const id of ['pulse','plasma','scatter','seeker','cutter'] as const)
    assert.ok(Math.abs(weaponDamage(id,run.damage)/WEAPONS[id].damage-1.35)<1e-8);
});

test('each new projectile cadence survives weapon switching and cannot be bypassed', () => {
  for(const id of ['plasma','scatter','seeker'] as const) {
    const battery=new WeaponBattery();battery.select(id);
    assert.equal(battery.fire(BASE_FIRE_INTERVAL,false,true,true),id);
    battery.select('pulse');battery.select(id);
    assert.equal(battery.fire(BASE_FIRE_INTERVAL,true,true,true),null);
    battery.update(WEAPONS[id].interval*.99);
    assert.equal(battery.fire(BASE_FIRE_INTERVAL,true,true,true),null);
    battery.update(WEAPONS[id].interval*.02);
    assert.equal(battery.fire(BASE_FIRE_INTERVAL,true,true,true),id);
  }
});
