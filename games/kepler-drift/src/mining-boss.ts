import * as T from 'three';
import type { Rock } from './asteroids.ts';
import type { CombatTarget } from './combat.ts';
import { createMiningBossModel } from './mining-boss-model.ts';
import { segmentSphereHit } from './state.ts';

export const BOSS_CUTTER_DPS = 180;
export const BOSS_TIMINGS = { approach: 3, warning: 1.6, firing: .32, recovery: 2.08, exposed: 4, closing: 1 } as const;
export type BossPhase = 'idle' | 'approach' | 'warning' | 'firing' | 'recovery' | 'exposed' | 'closing' | 'defeated';
export type BossEvent = 'warning' | 'fire' | 'open' | 'close';

export function bossMaxHealth(sector: number): number {
  const current = Number.isFinite(sector) ? Math.max(3, Math.floor(sector)) : 3;
  return Math.min(1380, 820 + Math.floor((current - 3) / 3) * 280);
}

/** A deterministic encounter clock, independent of rendering and DOM. */
export class BossBattery {
  phase: BossPhase = 'idle';
  hp = 0;
  maxHp = 0;
  remaining = 0;

  get active(): boolean { return this.phase !== 'idle' && this.phase !== 'defeated'; }
  get defeated(): boolean { return this.phase === 'defeated'; }
  get exposed(): boolean { return this.phase === 'exposed'; }

  spawn(sector: number): void {
    this.maxHp = bossMaxHealth(sector); this.hp = this.maxHp;
    this.phase = 'approach'; this.remaining = BOSS_TIMINGS.approach;
  }

  reset(): void { this.phase = 'idle'; this.hp = 0; this.maxHp = 0; this.remaining = 0; }

  /** Returns true only for the single hit that destroys the open reactor. */
  hit(damage: number): boolean {
    if (!this.active || !this.exposed || !Number.isFinite(damage) || damage <= 0) return false;
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp > 0) return false;
    this.phase = 'defeated'; this.remaining = 0;
    return true;
  }

  update(dt: number): BossEvent[] {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return [];
    // A suspended browser may report a huge delta. Bound the catch-up work;
    // ordinary frames and pause/resume leave every phase's duration unchanged.
    let left = Math.min(dt, 30);
    const events: BossEvent[] = [];
    while (left + 1e-10 >= this.remaining) {
      left = Math.max(0, left - this.remaining);
      if (this.phase === 'approach' || this.phase === 'closing') {
        this.phase = 'warning'; this.remaining = BOSS_TIMINGS.warning; events.push('warning');
      } else if (this.phase === 'warning') {
        this.phase = 'firing'; this.remaining = BOSS_TIMINGS.firing; events.push('fire');
      } else if (this.phase === 'firing') {
        this.phase = 'recovery'; this.remaining = BOSS_TIMINGS.recovery;
      } else if (this.phase === 'recovery') {
        this.phase = 'exposed'; this.remaining = BOSS_TIMINGS.exposed; events.push('open');
      } else {
        this.phase = 'closing'; this.remaining = BOSS_TIMINGS.closing; events.push('close');
      }
    }
    this.remaining = Math.max(0, this.remaining - left);
    return events;
  }
}

/** Distance between two finite segments, including a stationary player. */
export function bossLaneDistance(a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3): number {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = d.x - c.x, vy = d.y - c.y, vz = d.z - c.z;
  const wx = a.x - c.x, wy = a.y - c.y, wz = a.z - c.z;
  const aa = ux * ux + uy * uy + uz * uz, bb = ux * vx + uy * vy + uz * vz;
  const cc = vx * vx + vy * vy + vz * vz, dd = ux * wx + uy * wy + uz * wz, ee = vx * wx + vy * wy + vz * wz;
  const denominator = aa * cc - bb * bb;
  let s = 0, t = 0;
  if (aa < 1e-12 && cc < 1e-12) return a.distanceTo(c);
  if (aa < 1e-12) t = T.MathUtils.clamp(ee / cc, 0, 1);
  else if (cc < 1e-12) s = T.MathUtils.clamp(-dd / aa, 0, 1);
  else {
    s = denominator > 1e-12 ? T.MathUtils.clamp((bb * ee - cc * dd) / denominator, 0, 1) : 0;
    t = (bb * s + ee) / cc;
    if (t < 0) { t = 0; s = T.MathUtils.clamp(-dd / aa, 0, 1); }
    else if (t > 1) { t = 1; s = T.MathUtils.clamp((bb - dd) / aa, 0, 1); }
  }
  return Math.hypot(wx + s * ux - t * vx, wy + s * uy - t * vy, wz + s * uz - t * vz);
}

/** The first solid rock clips an attack; hidden or destroyed rocks cannot be cover. */
export function bossLaneEnd(from: T.Vector3, to: T.Vector3, rocks: readonly Rock[], out = new T.Vector3()): T.Vector3 {
  let nearest = 1;
  for (const rock of rocks) {
    if (rock.wait > 0 || rock.hp <= 0 || !rock.root.visible) continue;
    const p = rock.root.position;
    const hit = segmentSphereHit(from.x, from.y, from.z, to.x, to.y, to.z, p.x, p.y, p.z, rock.radius * .93);
    if (hit !== null) nearest = Math.min(nearest, hit);
  }
  return out.copy(from).lerp(to, nearest);
}

interface BossContext {
  player: T.Vector3;
  rocks: readonly Rock[];
  worldSpeed: number;
  intersectsPlayer?(from: T.Vector3, to: T.Vector3, radius: number): boolean;
}
interface BossHooks {
  hitPlayer(amount: number, reason: string): void;
  destroyed(position: T.Vector3): void;
  shot(): void;
}
interface Lane {
  origin: T.Vector3; aim: T.Vector3; end: T.Vector3;
  line: T.Line; geometry: T.BufferGeometry; positions: Float32Array; hit: boolean;
}

/** One persistent model and two attack lines; restart never pays a kill reward. */
export class MiningBoss {
  readonly model = createMiningBossModel();
  readonly root = this.model.root;
  readonly battery = new BossBattery();
  private readonly reactorTarget: CombatTarget = {
    position: new T.Vector3(), previousPosition: new T.Vector3(), radius: 2.8, hp: 0, maxHp: 0, active: false, kind: 'reactor', label: 'РЕАКТОР ЗАКРЫТ',
  };
  private readonly warnings = new T.Group();
  private readonly lineMaterial = new T.LineBasicMaterial({ color: 0xf08850, transparent: true, opacity: .7, depthWrite: false, toneMapped: false });
  private readonly lanes: Lane[];
  private readonly previousPlayer = new T.Vector3();
  private hasPlayer = false;
  private age = 0;
  private openAmount = 0;
  private sector = 3;
  private attackCount = 1;
  private readonly glow: T.MeshStandardMaterial | T.MeshBasicMaterial;
  private readonly hooks: BossHooks;
  private readonly reducedMotion: boolean;

  constructor(scene: T.Scene, hooks: BossHooks, reducedMotion = false) {
    this.hooks = hooks; this.reducedMotion = reducedMotion;
    const material = this.model.reactorGlow.material;
    this.glow = (Array.isArray(material) ? material[0] : material) as T.MeshStandardMaterial | T.MeshBasicMaterial;
    this.lanes = Array.from({ length: 2 }, () => {
      const positions = new Float32Array(6), geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
      const line = new T.Line(geometry, this.lineMaterial); line.frustumCulled = false; line.visible = false;
      this.warnings.add(line);
      return { origin: new T.Vector3(), aim: new T.Vector3(), end: new T.Vector3(), line, geometry, positions, hit: false };
    });
    this.root.visible = false; this.warnings.visible = false;
    scene.add(this.root, this.warnings);
  }

  get active(): boolean { return this.battery.active; }
  get defeated(): boolean { return this.battery.defeated; }
  get health(): number { return this.battery.maxHp > 0 ? this.battery.hp / this.battery.maxHp : 0; }
  get reactorOpen(): boolean { return this.battery.exposed; }
  get target(): CombatTarget | null { return this.active && this.reactorOpen ? this.reactorTarget : null; }
  get bodyTarget(): CombatTarget | null { return this.active ? this.reactorTarget : null; }
  get warning(): string {
    if (!this.active) return '';
    if (this.battery.phase === 'approach') return 'Добывающий корабль · приготовьтесь';
    if (this.battery.phase === 'warning' || this.battery.phase === 'firing') return 'Уйдите с линии выстрела';
    if (this.reactorOpen) return 'Реактор открыт · время резака';
    return 'Броня закрыта · держите дистанцию';
  }

  reset(): void {
    this.battery.reset(); this.root.visible = false; this.warnings.visible = false;
    this.reactorTarget.active = false; this.age = 0; this.openAmount = 0; this.hasPlayer = false;
    this.reactorTarget.previousPosition!.copy(this.reactorTarget.position);
    for (const lane of this.lanes) { lane.line.visible = false; lane.hit = false; }
    this.updateShutters(0);
  }

  spawn(sector: number): void {
    this.reset(); this.sector = Number.isFinite(sector) ? Math.max(3, Math.floor(sector)) : 3;
    this.battery.spawn(this.sector); this.attackCount = this.sector >= 6 ? 2 : 1;
    this.root.visible = true; this.root.position.set(0, 2, -110);
    this.reactorTarget.active = true; this.syncTarget(); this.updateGlow();
    this.reactorTarget.previousPosition!.copy(this.reactorTarget.position);
  }

  update(dt: number, ctx: BossContext): void {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    this.reactorTarget.previousPosition!.copy(this.reactorTarget.position);
    const step = Math.min(dt, 30), events = this.battery.update(step); this.age += step;
    if (!this.hasPlayer) { this.previousPlayer.copy(ctx.player); this.hasPlayer = true; }
    if (this.battery.phase === 'approach') {
      const arrival = 1 - this.battery.remaining / BOSS_TIMINGS.approach;
      this.root.position.z = T.MathUtils.lerp(-110, -65, arrival * arrival * (3 - 2 * arrival));
    } else this.root.position.z = -65;
    if (this.battery.phase !== 'warning' && this.battery.phase !== 'firing') {
      this.root.position.y = 2 + Math.sin(this.age * .45) * (this.reducedMotion ? .12 : .35);
    }
    this.root.updateMatrixWorld(true); this.syncTarget();
    for (const event of events) {
      if (event === 'warning') this.lockLanes(ctx.player);
      if (event === 'fire') this.hooks.shot();
    }
    const warning = this.battery.phase === 'warning', firing = this.battery.phase === 'firing';
    this.warnings.visible = warning || firing;
    this.lineMaterial.color.setHex(firing ? 0xff7045 : 0xf0a266);
    this.lineMaterial.opacity = firing ? 1 : this.reducedMotion ? .7 : .5 + Math.sin(this.age * 7) * .16;
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i]; lane.line.visible = i < this.attackCount && (warning || firing);
      if (i >= this.attackCount || (!warning && !firing && !events.includes('fire'))) continue;
      bossLaneEnd(lane.origin, lane.aim, ctx.rocks, lane.end); this.drawLane(lane);
      if ((firing || events.includes('fire')) && !lane.hit) {
        const contact = ctx.intersectsPlayer
          ? ctx.intersectsPlayer(lane.origin, lane.end, .32)
          : bossLaneDistance(lane.origin, lane.end, this.previousPlayer, ctx.player) <= 1.4;
        if (contact) { lane.hit = true; this.hooks.hitPlayer(this.sector >= 6 ? 30 : 38, 'Буровой залп'); }
      }
    }
    const opening = this.reactorOpen ? 1 : 0;
    this.openAmount += (opening - this.openAmount) * (1 - Math.exp(-step * 14));
    this.updateShutters(this.openAmount); this.updateGlow();
    for (const drill of this.model.drills) drill.rotation.z += step * (firing ? 5 : warning ? 2.2 : .8);
    this.previousPlayer.copy(ctx.player);
  }

  hit(target: CombatTarget, damage: number): void {
    if (target !== this.reactorTarget || !this.active) return;
    const destroyed = this.battery.hit(damage); this.syncTarget();
    if (destroyed) {
      this.root.visible = false; this.warnings.visible = false; this.reactorTarget.active = false;
      this.hooks.destroyed(this.reactorTarget.position.clone());
    }
  }

  blast(position: T.Vector3, radius: number, damage: number): void {
    if (!this.target || !Number.isFinite(radius) || radius <= 0) return;
    const distance = Math.max(0, this.reactorTarget.position.distanceTo(position) - this.reactorTarget.radius);
    if (distance < radius) this.hit(this.reactorTarget, damage * (1 - distance / radius));
  }

  private syncTarget(): void {
    this.model.reactor.getWorldPosition(this.reactorTarget.position);
    this.reactorTarget.hp = this.battery.hp; this.reactorTarget.maxHp = this.battery.maxHp;
    this.reactorTarget.active = this.active;
    this.reactorTarget.label = this.reactorOpen ? 'РЕАКТОР ОТКРЫТ' : 'РЕАКТОР ЗАКРЫТ';
  }

  private lockLanes(player: T.Vector3): void {
    for (let i = 0; i < this.attackCount; i++) {
      const lane = this.lanes[i], turret = this.model.turrets[i % this.model.turrets.length] ?? this.model.reactor;
      turret.getWorldPosition(lane.origin);
      lane.aim.copy(player); if (this.attackCount > 1) lane.aim.x += i === 0 ? -1.8 : 1.8;
      // Keep the lane running beyond the ship so it reads as a ray rather than a marker.
      lane.aim.sub(lane.origin).multiplyScalar(1.25).add(lane.origin); lane.hit = false;
    }
  }

  private drawLane(lane: Lane): void {
    lane.origin.toArray(lane.positions, 0); lane.end.toArray(lane.positions, 3);
    lane.geometry.attributes.position.needsUpdate = true;
  }

  private updateShutters(amount: number): void {
    for (let i = 0; i < this.model.shutters.length; i++) {
      const shutter = this.model.shutters[i];
      const side = Number(shutter.userData.side) || (i % 2 === 0 ? -1 : 1);
      const closed = Number(shutter.userData.closedX);
      shutter.position.x = (Number.isFinite(closed) ? closed : side * 1.17) + side * amount * 4.2;
    }
  }

  private updateGlow(): void {
    const color = this.reactorOpen ? 0x69e8ff : 0xe99b45;
    this.glow.color.setHex(color);
    if (this.glow instanceof T.MeshStandardMaterial) {
      this.glow.emissive.setHex(color);
      const charge = this.battery.phase === 'warning' ? 1 - this.battery.remaining / BOSS_TIMINGS.warning : 0;
      this.glow.emissiveIntensity = this.reactorOpen ? 2.3 : .65 + charge * .65;
    }
  }
}
