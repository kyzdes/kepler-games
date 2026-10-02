export type AsteroidKind = 'normal' | 'volatile' | 'armored';

export const SECTOR_HAZARDS = [
  { volatile: 0, armored: 0, hint: 'Золотые жилы · собирайте руду' },
  { volatile: .12, armored: 0, hint: 'Красные трещины · взрывоопасно' },
  { volatile: .18, armored: .10, hint: 'Бронекамни · используйте резак' },
  { volatile: .22, armored: .16, hint: 'Плотный поток · держите дистанцию' },
  { volatile: .27, armored: .20, hint: 'Взрывные группы · осторожнее с плазмой' },
  { volatile: .32, armored: .24, hint: 'Последний рывок · берегите заряд луча' },
] as const;

export function sectorHazards(sector: number) {
  return SECTOR_HAZARDS[Math.max(0, Math.min(SECTOR_HAZARDS.length - 1, Math.floor(sector) - 1))];
}
export function flightHint(sector: number, mode: string): string {
  return mode==='endless' && sector>SECTOR_HAZARDS.length
    ? 'Сохраняйте добычу · эвакуация в мастерской' : sectorHazards(sector).hint;
}
export function asteroidKind(sector: number, roll: number): AsteroidKind {
  const odds = sectorHazards(sector);
  if (roll < odds.volatile) return 'volatile';
  if (roll < odds.volatile + odds.armored) return 'armored';
  return 'normal';
}
export function blastRadius(radius: number): number { return 11 + radius * 1.7; }
export function blastDamage(radius: number, distance: number): number {
  const range = blastRadius(radius);
  if (distance >= range) return 0;
  return (38 + radius * 4) * (1 - Math.max(0, distance) / range);
}
