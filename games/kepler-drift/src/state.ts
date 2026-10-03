import type { RunMode } from './expedition.ts';
import { WEAPONS, MAX_ENERGY_LEVEL } from './weapons.ts';
import type { WeaponId } from './weapons.ts';

export type Phase = 'ready' | 'flying' | 'paused' | 'armory' | 'upgrade' | 'ended';
export type UpgradeId = 'laser' | 'engine' | 'magnet' | 'shield' | 'repair' | 'multishot';
export const WEAPON_UPGRADES = ['laser', 'multishot'] as const;
export interface Run {
  mode: RunMode; pirateKills: number; bossKills: number;
  phase: Phase; sector: number; sectorTime: number; elapsed: number;
  ore: number; mined: number; kills: number; hull: number; maxHull: number;
  shield: number; maxShield: number; damage: number; fireInterval: number;
  magnet: number; speed: number; boostCooldown: number; multishot: boolean;
  levels: Record<UpgradeId, number>; won: boolean;
  unlockedWeapons: Record<WeaponId, boolean>;
}
export const SECTOR_SECONDS = 75;
export const SECTORS = ['ВНЕШНИЙ ПОЯС', 'РАЗЛОМ КЕПЛЕРА', 'СЕРДЦЕ ПОЯСА', 'ТУМАННОСТЬ ЭХО', 'ГРОЗОВОЙ ФРОНТ', 'КОРОНА КЕПЛЕРА'];
export const TOTAL_SECTORS = SECTORS.length;
export const UPGRADES: Record<UpgradeId, { name: string; description: string; cost: number; icon: string; color: string }> = {
  laser: { name: 'Энергоконтур', description: 'Урон всего арсенала +35%. Перезарядка резака −0,8 с. Максимум — уровень 5.', cost: 55, icon: 'crosshair', color: 'orange' },
  engine: { name: 'Векторная тяга', description: 'Манёвренность +18%. Форсаж восстанавливается быстрее.', cost: 45, icon: 'flame', color: 'blue' },
  magnet: { name: 'Гравитационный захват', description: 'Радиус притяжения руды +45%. Меньше рискованных манёвров.', cost: 40, icon: 'magnet', color: 'gold' },
  shield: { name: 'Защитный контур', description: 'Ёмкость щита +25. Полностью восстанавливает щит.', cost: 60, icon: 'shield', color: 'blue' },
  repair: { name: 'Наноремонт', description: 'Восстанавливает 50 единиц корпуса и весь щит.', cost: 30, icon: 'wrench', color: 'gold' },
  multishot: { name: 'Тройной залп', description: 'Три импульса из каждого ствола или три плазменных снаряда. Картечь, ракеты и резак сохраняют свой залп.', cost: 100, icon: 'scan-line', color: 'orange' },
};
export function createRun(mode: RunMode = 'expedition'): Run {
  return { mode, pirateKills: 0, bossKills: 0, phase: 'ready', sector: 1, sectorTime: 0, elapsed: 0, ore: 0, mined: 0, kills: 0,
    hull: 100, maxHull: 100, shield: 75, maxShield: 75, damage: 14, fireInterval: 0.19,
    magnet: 21, speed: 11, boostCooldown: 4.5, multishot: false,
    levels: { laser: 1, engine: 1, magnet: 1, shield: 1, repair: 0, multishot: 0 }, won: false,
    unlockedWeapons: { pulse: true, plasma: false, scatter: false, seeker: false, cutter: false } };
}
export function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
/** More encounters each sector, with a gradual ramp within the sector. */
export function flightSpeed(sector: number, sectorTime: number): number {
  return 18 + (clamp(sector, 1, TOTAL_SECTORS) - 1) * 6 + clamp(sectorTime / SECTOR_SECONDS, 0, 1) * 4;
}
/** Total salvage per asteroid, independent of the number of visual crystals. */
export function asteroidOre(radius: number, rich: boolean): number {
  const size = clamp(radius, 1, 6);
  return rich ? Math.round(2 + size * 1.4) : Math.max(1, Math.round(size * .4));
}
export function splitOre(total: number, maxPieces: number): number[] {
  const count = Math.min(total, Math.max(0, Math.floor(maxPieces)));
  if (count === 0) return [];
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}
export function upgradeCost(run: Run, id: UpgradeId): number {
  return UPGRADES[id].cost + Math.max(0, run.levels[id] - 1) * 25;
}
export function canBuyWeapon(run: Run, id: WeaponId): boolean {
  return (run.phase === 'armory' || run.phase === 'upgrade') && !run.unlockedWeapons[id]
    && Number.isFinite(run.ore) && run.ore >= WEAPONS[id].cost;
}
export function buyWeapon(run: Run, id: WeaponId): boolean {
  if (!canBuyWeapon(run, id)) return false;
  run.ore -= WEAPONS[id].cost; run.unlockedWeapons[id] = true;
  return true;
}
export function upgradeMaxed(run: Run, id: UpgradeId): boolean {
  return (id === 'laser' && run.levels.laser >= MAX_ENERGY_LEVEL) || (id === 'multishot' && run.multishot);
}
export function buyUpgrade(run: Run, id: UpgradeId): boolean {
  const cost = upgradeCost(run, id);
  const shopOpen=run.phase==='upgrade' || (run.phase==='armory' && (id==='laser' || id==='multishot'));
  if (!shopOpen || run.ore < cost || upgradeMaxed(run, id) || (id === 'repair' && run.hull === run.maxHull && run.shield === run.maxShield)) return false;
  run.ore -= cost;
  run.levels[id]++;
  if (id === 'laser') { run.damage *= 1.35; run.fireInterval = Math.max(0.09, run.fireInterval * 0.96); }
  if (id === 'engine') { run.speed *= 1.18; run.boostCooldown *= 0.8; }
  if (id === 'magnet') run.magnet *= 1.45;
  if (id === 'shield') { run.maxShield += 25; run.shield = run.maxShield; }
  if (id === 'repair') { run.hull = Math.min(run.maxHull, run.hull + 50); run.shield = run.maxShield; }
  if (id === 'multishot') run.multishot = true;
  return true;
}
export function damageShip(run: Run, amount: number): void {
  const absorbed = Math.min(run.shield, amount);
  run.shield -= absorbed;
  run.hull = Math.max(0, run.hull - (amount - absorbed));
  if (run.hull === 0) run.phase = 'ended';
}
export function collectOre(run: Run, amount: number): void { run.ore += amount; run.mined += amount; }
export function mulberry32(seed: number): () => number {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function rollUpgrades(run: Run, rng = Math.random): UpgradeId[] {
  const ids = (Object.keys(UPGRADES) as UpgradeId[]).filter(id => !upgradeMaxed(run, id));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const chosen = ids.slice(0, 3);
  if (run.hull < 60 && !chosen.includes('repair')) chosen[2] = 'repair';
  return chosen;
}
export function segmentSphereHit(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, radius: number): number | null {
  const dx = bx - ax, dy = by - ay, dz = bz - az, ox = ax - cx, oy = ay - cy, oz = az - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c <= 0) return 0;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
