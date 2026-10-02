import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOSS_ARRIVAL_SECONDS, MAX_FORWARD_SPEED, MAX_RUN_SECTOR,
  worldSector, visualSector, endlessPressure, cappedForwardSpeed, bossScheduled, shouldSpawnBoss,
  canAdvanceSector, isExpeditionComplete, canExtract, nextSector,
} from '../src/expedition.ts';

test('the six worlds repeat while progression retains its actual sector', () => {
  assert.deepEqual(Array.from({ length: 18 }, (_, i) => worldSector(i + 1)), [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6]);
  assert.equal(worldSector(-2), 1); assert.equal(worldSector(NaN), 1); assert.equal(worldSector(Infinity), 1);
  assert.ok(worldSector(Number.MAX_SAFE_INTEGER) >= 1 && worldSector(Number.MAX_SAFE_INTEGER) <= 6);
  assert.equal(nextSector(MAX_RUN_SECTOR), MAX_RUN_SECTOR);
  assert.equal(nextSector(Number.MAX_SAFE_INTEGER), MAX_RUN_SECTOR);
});

test('deep drift reveals the jade giant after the original six worlds', () => {
  assert.deepEqual(Array.from({length:6},(_,i)=>visualSector(i+1,'endless')),[1,2,3,4,5,6]);
  for(const sector of [7,13,19]) assert.equal(visualSector(sector,'endless'),7);
  assert.equal(visualSector(8,'endless'),2);
  assert.equal(visualSector(7,'expedition'),1);
});

test('endless difficulty rises by bounded threat pressure rather than unlimited speed', () => {
  for (let sector = 1; sector <= 6; sector++) assert.equal(endlessPressure(sector), 0);
  assert.ok(endlessPressure(7) > 0); assert.equal(endlessPressure(24), 1); assert.equal(endlessPressure(MAX_RUN_SECTOR), 1);
  for (const sector of [1, 3, 6, 7, 24, MAX_RUN_SECTOR, Infinity]) {
    for (const time of [0, 40, 75, 10000]) assert.ok(cappedForwardSpeed(sector, time) <= MAX_FORWARD_SPEED);
  }
  assert.equal(cappedForwardSpeed(1, 0), 18); assert.equal(cappedForwardSpeed(6, 75), 52);
  assert.equal(cappedForwardSpeed(24, 0), 52);
  assert.ok(cappedForwardSpeed(1, 75) > cappedForwardSpeed(1, 0));
});

test('bosses arrive late in sectors three and six, and every third sector in endless flight', () => {
  for (let sector = 1; sector <= 18; sector++) {
    assert.equal(bossScheduled(sector, 'endless'), sector % 3 === 0);
    assert.equal(bossScheduled(sector, 'expedition'), sector === 3 || sector === 6);
    assert.equal(shouldSpawnBoss(sector, BOSS_ARRIVAL_SECONDS - .001, 'endless'), false);
    assert.equal(shouldSpawnBoss(sector, BOSS_ARRIVAL_SECONDS, 'endless'), sector % 3 === 0);
  }
});

test('a sector cannot complete early or skip its living boss', () => {
  for (let sector = 1; sector <= 18; sector++) {
    assert.equal(canAdvanceSector(sector, 74.999, true, 'endless'), false);
    assert.equal(canAdvanceSector(sector, 75, false, 'endless'), sector % 3 !== 0);
    assert.equal(canAdvanceSector(sector, 75, true, 'endless'), true);
    if (sector % 3 === 0) assert.equal(canAdvanceSector(sector, 10000, false, 'endless'), false);
  }
});

test('the finite expedition ends after sector six and its defeated boss; endless never forces an ending', () => {
  for (let sector = 1; sector <= 18; sector++) {
    assert.equal(isExpeditionComplete(sector, 75, true, 'expedition'), sector === 6);
    assert.equal(isExpeditionComplete(sector, 75, true, 'endless'), false);
  }
  assert.equal(isExpeditionComplete(6, 74, true), false); assert.equal(isExpeditionComplete(6, 75, false), false);
});

test('extraction is voluntary and available only at a protected completed-sector workshop', () => {
  assert.equal(canExtract('endless', 'upgrade', 1), true);
  assert.equal(canExtract('endless', 'upgrade', 100), true);
  assert.equal(canExtract('endless', 'upgrade', 0), false);
  assert.equal(canExtract('endless', 'upgrade', Infinity), false);
  for (const phase of ['ready', 'flying', 'paused', 'armory', 'ended']) assert.equal(canExtract('endless', phase, 3), false);
  assert.equal(canExtract('expedition', 'upgrade', 3), false);
});
