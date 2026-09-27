export const LAPS = 3;
export const HALF_WIDTH = 13;
export const MAX_SPEED = 108;
export const BOOST_SPEED = 146;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const wrap = (n: number, length: number) => ((n % length) + length) % length;
export function mulberry32(seed: number): () => number {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function formatTime(seconds: number, precise = true): string {
  if (!Number.isFinite(seconds)) return '—';
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${precise ? '.' + String(Math.floor(ms % 1000 / 10)).padStart(2, '0') : ''}`;
}
export type Phase = 'menu' | 'countdown' | 'racing' | 'paused' | 'finished';
export interface Driver { id: number; name: string; color: string; distance: number; lane: number; speed: number; finishTime: number | null; }
export interface Race extends Dynamics {
  phase: Phase; countdown: number; elapsed: number; drivers: Driver[]; energy: number;
  boosting: boolean; boostLocked: boolean; padBoost: number;
  collisionCooldown: number; hits: number; pads: number; lapTimes: number[]; lapStarted: number;
}
export interface Input { steer: number; throttle: boolean; brake: boolean; boost: boolean; handbrake?: boolean; }
export interface Pad { fraction: number; lane: number; }
export const PADS: Pad[] = [
  { fraction: .065, lane: -5 }, { fraction: .255, lane: 5 },
  { fraction: .44, lane: -5 }, { fraction: .625, lane: 5 }, { fraction: .84, lane: 0 },
];
export function createRace(): Race {
  const names = ['ВЫ', 'ВЕКТОР', 'КАССИНИ', 'НОВА', 'АТЛАС', 'ПОЛЮС'];
  const colors = ['#e7a165', '#88ccea', '#d9c194', '#9db9ab', '#acb1d9', '#dd9386'];
  return { ...createDynamics(), phase: 'menu', countdown: 3, elapsed: 0, energy: 100, boosting: false,
    boostLocked: false, padBoost: 0, collisionCooldown: 0, hits: 0, pads: 0, lapTimes: [], lapStarted: 0,
    drivers: names.map((name, id) => ({ id, name, color: colors[id], distance: id === 0 ? -52 : -8 - (id - 1) * 8,
      lane: id === 0 ? -4 : (id % 2 ? 4 : -4), speed: 0, finishTime: null })) };
}
export function standings(race: Race): Driver[] {
  return [...race.drivers].sort((a, b) => {
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    if (a.finishTime !== null) return -1;
    if (b.finishTime !== null) return 1;
    return b.distance - a.distance || a.id - b.id;
  });
}
export function advanceDriver(driver: Driver, distance: number, length: number, startTime: number, dt: number): void {
  if (driver.finishTime !== null) return;
  const finish = length * LAPS;
  const next = driver.distance + distance;
  if (next >= finish && distance > 0) {
    driver.finishTime = startTime + dt * clamp((finish - driver.distance) / distance, 0, 1);
    driver.distance = finish;
  } else driver.distance = next;
}
export function stepRace(race: Race, input: Input, dt: number, length: number, curvature: (distance: number) => number): void {
  if (race.phase === 'countdown') {
    race.countdown -= dt;
    if (race.countdown <= 0) race.phase = 'racing';
    return;
  }
  if (race.phase !== 'racing' || dt <= 0) return;
  const p = race.drivers[0], previous = p.distance, now = race.elapsed;
  race.collisionCooldown = Math.max(0, race.collisionCooldown - dt);
  race.padBoost = Math.max(0, race.padBoost - dt);
  if (race.boostLocked && race.energy >= 25) race.boostLocked = false;
  race.boosting = input.boost && !input.brake && !input.handbrake && !race.boostLocked && race.energy > 0 && p.speed > 18;
  race.energy = clamp(race.energy + (race.boosting ? -27 : 10) * dt, 0, 100);
  if (race.energy === 0) race.boostLocked = true;
  const topSpeed = race.boosting || race.padBoost > 0 ? BOOST_SPEED : MAX_SPEED;
  stepVehicle(p,race,input,dt,curvature(p.distance),topSpeed,race.boosting||race.padBoost>0);
  const lateralExtent=2.1*Math.cos(race.heading)+3.4*Math.abs(Math.sin(race.heading));
  const laneLimit=HALF_WIDTH-lateralExtent;
  if (Math.abs(p.lane) > laneLimit) {
    const side=Math.sign(p.lane),normalSpeed=Math.max(0,race.lateralSpeed*side);
    p.lane = side * laneLimit;
    // Resolve normal momentum; a glancing scrape preserves forward momentum.
    if(normalSpeed>0) {
      race.lateralSpeed=-side*normalSpeed*.27;
      p.speed=Math.max(0,p.speed-normalSpeed*.9);
      race.yawRate-=side*Math.min(.8,normalSpeed*.055);
    }
    if (race.collisionCooldown === 0 && normalSpeed > 1.2 && p.speed > 8) {
      race.impact=clamp(normalSpeed/16,.12,1);race.hits++;race.collisionCooldown=.45;
    }
  }
  const travel = p.speed * dt;
  const next = previous + travel;
  for (const pad of PADS) {
    const absolute = Math.floor(previous / length) * length + pad.fraction * length;
    const crossed = absolute <= previous ? absolute + length : absolute;
    if (previous < crossed && next >= crossed && Math.abs(p.lane - pad.lane) < 3.5) {
      race.padBoost = 1.5; race.energy = Math.min(100, race.energy + 18); race.pads++;
    }
  }
  for (let lap = race.lapTimes.length + 1; lap <= LAPS && next >= lap * length; lap++) {
    const crossedAt = now + dt * clamp((lap * length - previous) / Math.max(travel, .0001), 0, 1);
    race.lapTimes.push(crossedAt - race.lapStarted); race.lapStarted = crossedAt;
  }
  advanceDriver(p, travel, length, now, dt);
  for (const ai of race.drivers.slice(1)) {
    if (ai.finishTime !== null) continue;
    const target = 88 + ai.id * 1.35 + Math.sin(now * .21 + ai.id * 2) * 4 - Math.min(22, Math.abs(curvature(ai.distance + 25)) * 1550);
    ai.speed += (target - ai.speed) * (1 - Math.exp(-.7 * dt));
    const lane = (ai.id % 2 ? 5 : -5) + Math.sin(now * .32 + ai.id * 2.7) * 2.3;
    ai.lane += (lane - ai.lane) * dt;
    advanceDriver(ai, ai.speed * dt, length, now, dt);
    const separation = Math.abs(wrap(ai.distance - p.distance + length / 2, length) - length / 2);
    if (p.finishTime === null && separation < 6.4 && Math.abs(ai.lane - p.lane) < lateralExtent+2 && race.collisionCooldown === 0) {
      const side=p.lane>ai.lane?1:-1,relativeSpeed=p.speed-ai.speed;
      const impulse=Math.abs(relativeSpeed)*.38+Math.abs(race.lateralSpeed)*.35;
      p.speed=Math.max(0,p.speed-relativeSpeed*.35-2);
      ai.speed=Math.max(0,ai.speed+relativeSpeed*.25);
      race.lateralSpeed+=side*(3+Math.min(8,impulse*.35));
      p.lane=clamp(ai.lane+side*(lateralExtent+2.05),-laneLimit,laneLimit);
      race.yawRate+=side*.4;race.impact=clamp(impulse/24,.12,1);
      race.hits++;race.collisionCooldown=.7;
    }
  }
  race.elapsed = p.finishTime ?? now + dt;
  if (p.finishTime !== null) { race.phase = 'finished'; race.boosting = false; }
}
import { createDynamics, stepVehicle } from './physics.ts';
import type { Dynamics } from './physics.ts';
