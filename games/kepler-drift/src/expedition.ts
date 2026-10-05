import { flightSpeed, SECTOR_SECONDS, TOTAL_SECTORS } from './state.ts';

export type RunMode = 'expedition' | 'endless' | 'freeflight';
export const BOSS_ARRIVAL_SECONDS = 50;
export const MAX_FORWARD_SPEED = 52;
export const MAX_RUN_SECTOR = 1_000_000;

function validSector(sector: number): number {
  if (!Number.isFinite(sector)) return 1;
  return Math.max(1, Math.min(MAX_RUN_SECTOR, Math.floor(sector)));
}

/** Reuse the six worlds while keeping the expedition's actual sector number. */
export function worldSector(sector: number): number {
  return (validSector(sector) - 1) % TOTAL_SECTORS + 1;
}

/** The first trip keeps the original worlds; later loops reveal the jade giant. */
export function visualSector(sector: number, mode: RunMode = 'expedition'): number {
  return mode==='endless' && validSector(sector)>TOTAL_SECTORS && worldSector(sector)===1 ? 7 : worldSector(sector);
}

/** Threat composition ramps for another eighteen sectors, then holds steady. */
export function endlessPressure(sector: number): number {
  return Math.min(1, Math.max(0, (validSector(sector) - TOTAL_SECTORS) / 18));
}

/** The boost still multiplies this speed; endless flight never accelerates forever. */
export function cappedForwardSpeed(sector: number, sectorTime: number): number {
  const time = Number.isFinite(sectorTime) ? Math.max(0, sectorTime) : 0;
  return Math.min(MAX_FORWARD_SPEED, flightSpeed(validSector(sector), time) + endlessPressure(sector) * 4);
}

export function bossScheduled(sector: number, mode: RunMode = 'expedition'): boolean {
  const current = validSector(sector);
  return mode !== 'freeflight' && current % 3 === 0 && (mode === 'endless' || current <= TOTAL_SECTORS);
}

/** Free flight completes mining contracts instead of advancing on a timer. */
export function freeFlightQuota(sector: number): number { return 40 + (worldSector(sector) - 1) * 20; }

/** Call once per sector, guarded by the encounter's active/defeated state. */
export function shouldSpawnBoss(sector: number, sectorTime: number, mode: RunMode = 'expedition'): boolean {
  return bossScheduled(sector, mode) && sectorTime >= BOSS_ARRIVAL_SECONDS;
}

export function canAdvanceSector(sector: number, sectorTime: number, bossDefeated: boolean, mode: RunMode = 'expedition'): boolean {
  return mode !== 'freeflight' && sectorTime >= SECTOR_SECONDS && (!bossScheduled(sector, mode) || bossDefeated);
}

export function isExpeditionComplete(sector: number, sectorTime: number, bossDefeated: boolean, mode: RunMode = 'expedition'): boolean {
  return mode === 'expedition' && validSector(sector) === TOTAL_SECTORS && canAdvanceSector(sector, sectorTime, bossDefeated, mode);
}

/** Extraction belongs to the protected inter-sector workshop, after a completed sector. */
export function canExtract(mode: RunMode, phase: string, completedSectors: number): boolean {
  return mode === 'endless' && phase === 'upgrade' && Number.isFinite(completedSectors) && completedSectors >= 1;
}

export function nextSector(sector: number): number {
  return Math.min(MAX_RUN_SECTOR, validSector(sector) + 1);
}
