import { segmentSphereHit } from './state.ts';

export type PirateKind = 'fighter' | 'sniper';
export const MAX_PIRATES = 5;
export const MAX_ENEMY_SHOTS = 24;
export const PIRATE_GRACE_SECONDS = 14;
export const SNIPER_WINDUP = 1.5;
export const FIGHTER_WINDUP = .8;
export const FIGHTER_BURST_GAP = .18;
export const FIGHTER_BURST_SHOTS = 3;
export const ATTACK_LOCK = 1;
const SHOT_BIT = 2;

/** Pressure grows by adding readable encounters, rather than faster surprise shots. */
export function piratePressure(sector: number): { limit: number; interval: number } {
  const level = Math.max(1, Math.min(10, Math.floor(Number.isFinite(sector) ? sector : 1)));
  return { limit: Math.min(MAX_PIRATES, 2 + Math.floor(level / 2)), interval: Math.max(6.5, 12 - (level - 1) * 1.15) };
}

export function shouldSpawnPirate(sector: number, elapsed: number, active: number, cooldown: number, bossActive: boolean): boolean {
  return !bossActive && elapsed >= PIRATE_GRACE_SECONDS && cooldown <= 0 && active < piratePressure(sector).limit;
}

export interface PirateAttackClock {
  phase: 'cooldown' | 'charging' | 'burst';
  remaining: number;
  shotsLeft: number;
}

/** Bit zero requests a new aim lock; higher bits give the number of shots due. */
export function advancePirateAttack(clock: PirateAttackClock, kind: PirateKind, dt: number): number {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  clock.remaining -= dt;
  if (clock.remaining > 1e-9) return 0;
  if (clock.phase === 'cooldown') {
    // A new lock receives the complete warning duration, even after a long frame.
    clock.phase = 'charging'; clock.remaining = kind === 'sniper' ? SNIPER_WINDUP : FIGHTER_WINDUP;
    clock.shotsLeft = kind === 'fighter' ? FIGHTER_BURST_SHOTS : 1;
    return ATTACK_LOCK;
  }
  let count = 0;
  while (clock.remaining <= 1e-9 && clock.shotsLeft > 0) {
    count++; clock.shotsLeft--;
    clock.remaining += FIGHTER_BURST_GAP;
  }
  if (clock.shotsLeft > 0) clock.phase = 'burst';
  else {
    clock.phase = 'cooldown'; clock.remaining = kind === 'sniper' ? 5.2 : 3.8;
  }
  return count * SHOT_BIT;
}

export interface MutableEnemyHealth { hp: number; active: boolean; }

/** Invalidates a lethal target before a caller pays its reward, including reentrant blasts. */
export function damagePirate(target: MutableEnemyHealth, amount: number): 'none' | 'hit' | 'destroyed' {
  if (!target.active || !Number.isFinite(amount) || amount <= 0) return 'none';
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp > 0) return 'hit';
  target.active = false;
  return 'destroyed';
}

export interface ShotPoint { x: number; y: number; z: number; }
export interface ShotCover {
  position: ShotPoint;
  previous: ShotPoint;
  radius: number;
  active: boolean;
}

/** Sweeps relative to moving cover so neither a fast shot nor a fast rock tunnels. */
export function firstCoverHit(from: ShotPoint, to: ShotPoint, covers: readonly ShotCover[], shotRadius: number): number | null {
  let closest = Infinity;
  for (const cover of covers) {
    if (!cover.active) continue;
    const time = segmentSphereHit(
      from.x - cover.previous.x, from.y - cover.previous.y, from.z - cover.previous.z,
      to.x - cover.position.x, to.y - cover.position.y, to.z - cover.position.z,
      0, 0, 0, cover.radius + shotRadius,
    );
    if (time !== null && time < closest) closest = time;
  }
  return closest === Infinity ? null : closest;
}

export function firstEnemyImpact(from: ShotPoint, to: ShotPoint, playerFrom: ShotPoint, playerTo: ShotPoint,
  covers: readonly ShotCover[], shotRadius: number, playerRadius = 2): { kind: 'cover' | 'player'; time: number } | null {
  const cover = firstCoverHit(from, to, covers, shotRadius);
  const player = segmentSphereHit(
    from.x - playerFrom.x, from.y - playerFrom.y, from.z - playerFrom.z,
    to.x - playerTo.x, to.y - playerTo.y, to.z - playerTo.z,
    0, 0, 0, playerRadius + shotRadius,
  );
  // Cover wins a simultaneous surface contact; it never hurts or detonates a rock.
  if (cover !== null && (player === null || cover <= player)) return { kind: 'cover', time: cover };
  return player === null ? null : { kind: 'player', time: player };
}
