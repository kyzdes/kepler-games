import * as T from 'three';
import type { Rock } from './asteroids.ts';
import type { CombatTarget } from './combat.ts';
import { segmentSphereHit } from './state.ts';
import { MAX_PLAYER_PROJECTILES, PLASMA_PROXIMITY, PLASMA_RADIUS, SCATTER_PELLETS, SCATTER_RANGE, SEEKER_BLAST_RADIUS } from './weapons.ts';

export interface CombatHits {
  targets: readonly CombatTarget[];
  hit(target: CombatTarget, damage: number, position: T.Vector3): void;
}

export type ProjectileKind = 'pulse' | 'plasma' | 'scatter' | 'seeker';
export interface ShotOptions {
  kind: ProjectileKind;
  damage: number;
  /** Only exposed reactors belong here; the collision list may also include closed armour. */
  targets?: readonly CombatTarget[];
  /** Basis of the cannons; omitted for the original forward corridor. */
  heading?: T.Quaternion;
}

interface Projectile {
  mesh: T.Mesh;
  trail: T.Mesh;
  velocity: T.Vector3;
  forward: T.Vector3;
  life: number;
  range: number;
  kind: ProjectileKind;
  damage?: number;
  target: CombatTarget | null;
}

const UP = new T.Vector3(0, 1, 0);
const FORWARD = new T.Vector3(0, 0, -1);
const SCATTER_SPREAD = [-.17, -.065, .065, .17];
const SEEKER_TURN_RATE = 2.6;
const SHOT_SPEED: Record<ProjectileKind, number> = { pulse: 160, plasma: 105, scatter: 185, seeker: 100 };
const SHOT_RANGE: Record<ProjectileKind, number> = { pulse: 288, plasma: 273, scatter: SCATTER_RANGE, seeker: 260 };

/** A bounded, reusable shot pool. Every shot resolves its earliest moving-body hit. */
export class Projectiles {
  private readonly scene: T.Scene;
  private readonly shots: Projectile[] = [];
  private readonly spare: Projectile[] = [];
  private allocated = 0;
  private readonly geometries: Record<ProjectileKind, T.BufferGeometry> = {
    pulse: new T.CylinderGeometry(.038, .065, 2.4, 6),
    plasma: new T.IcosahedronGeometry(.38, 1),
    scatter: new T.IcosahedronGeometry(.095, 0),
    seeker: new T.CylinderGeometry(.025, .135, 1.05, 6),
  };
  private readonly materials: Record<ProjectileKind, T.MeshBasicMaterial> = {
    pulse: new T.MeshBasicMaterial({ color: new T.Color(5, 1.6, .35), toneMapped: false }),
    plasma: new T.MeshBasicMaterial({ color: new T.Color(.7, 1.1, 4), toneMapped: false }),
    scatter: new T.MeshBasicMaterial({ color: new T.Color(.7, 3.3, 3.8), toneMapped: false }),
    seeker: new T.MeshBasicMaterial({ color: new T.Color(3.5, 1.4, .3), toneMapped: false }),
  };
  private readonly trailGeometry = new T.ConeGeometry(.135, 1.8, 6);
  private readonly trailMaterial = new T.MeshBasicMaterial({ color: new T.Color(.5, 3.2, 1.4), toneMapped: false });
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly impact = new T.Vector3();
  private readonly bodyAtImpact = new T.Vector3();
  private readonly direction = new T.Vector3();
  private readonly desired = new T.Vector3();
  private readonly turnAxis = new T.Vector3();
  private readonly right = new T.Vector3();
  private readonly up = new T.Vector3();
  private readonly flightForward = new T.Vector3();
  private frameFraction = 1;

  constructor(scene: T.Scene) { this.scene = scene; }

  get count(): number { return this.shots.length; }

  fire(muzzles: readonly T.Object3D[], aim: T.Vector3, multishot: boolean, options?: ShotOptions): void {
    if (!muzzles.length) return;
    const kind = options?.kind ?? 'pulse';
    this.right.set(1, 0, 0); this.up.copy(UP); this.flightForward.copy(FORWARD);
    if (options?.heading) {
      this.right.applyQuaternion(options.heading); this.up.applyQuaternion(options.heading); this.flightForward.applyQuaternion(options.heading);
    }
    if (kind === 'scatter') {
      const barrels = Math.min(2, muzzles.length);
      for (let pellet = 0; pellet < SCATTER_PELLETS; pellet++) {
        muzzles[pellet % barrels].getWorldPosition(this.start);
        // Four lanes per cannon form a useful close-range cone, regardless of multishot.
        const lane = Math.floor(pellet / barrels) % SCATTER_SPREAD.length;
        this.aimDirection(aim);
        this.direction.addScaledVector(this.right, SCATTER_SPREAD[lane]);
        this.direction.addScaledVector(this.up, (pellet % 2 ? 1 : -1) * .018);
        this.direction.normalize();
        this.launch(kind, options, null);
      }
      return;
    }
    if (kind === 'seeker') {
      for (let missile = 0; missile < 2; missile++) {
        muzzles[missile % muzzles.length].getWorldPosition(this.start);
        this.aimDirection(aim);
        if (this.direction.dot(this.flightForward) <= .05) this.direction.copy(this.flightForward);
        const target = this.findLock(options?.targets ?? [], this.start, this.direction);
        this.launch(kind, options, target);
      }
      return;
    }
    // Plasma is a single central orb, so its two muzzles cannot duplicate one explosion.
    const barrels = kind === 'plasma' ? 1 : muzzles.length;
    for (let barrel = 0; barrel < barrels; barrel++) {
      muzzles[barrel].getWorldPosition(this.start);
      if (kind === 'plasma' && muzzles.length > 1) {
        muzzles[1].getWorldPosition(this.end);
        this.start.add(this.end).multiplyScalar(.5);
      }
      const spreads = multishot ? (kind === 'plasma' ? [-.055, 0, .055] : [-.032, 0, .032]) : [0];
      for (const spread of spreads) {
        this.aimDirection(aim);
        this.direction.addScaledVector(this.right, spread);
        this.direction.normalize();
        this.launch(kind, options, null);
      }
    }
  }

  update(dt: number, rocks: readonly Rock[], damage: number,
    onHit: (rock: Rock, position: T.Vector3, kind: ProjectileKind) => void,
    onBlast: (position: T.Vector3, kind?: ProjectileKind) => void = () => {}, alive: () => boolean = () => true,
    combat?: CombatHits): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      if (!alive()) break;
      const speed = SHOT_SPEED[shot.kind];
      const step = Math.max(0, Math.min(dt, shot.life, shot.range / speed));
      this.frameFraction = step / dt;
      if (shot.kind === 'seeker') this.guide(shot, step);
      this.start.copy(shot.mesh.position);
      this.end.copy(this.start).addScaledVector(shot.velocity, step);
      shot.life -= dt;
      shot.range -= speed * step;
      let hit: Rock | null = null, hostile: CombatTarget | null = null, nearest = 2;
      const proximity = shot.kind === 'plasma' ? PLASMA_PROXIMITY : shot.kind === 'seeker' ? .12 : 0;
      for (const rock of rocks) {
        if (rock.wait > 0) continue;
        const p = rock.root.position, previous = rock.previousPosition ?? p;
        const time = this.movingHit(previous, p, rock.radius * .93 + proximity);
        if (time !== null && time < nearest) { nearest = time; hit = rock; }
      }
      for (const target of combat?.targets ?? []) {
        if (!target.active) continue;
        const time = this.movingHit(target.previousPosition ?? target.position, target.position, target.radius + proximity);
        if (time !== null && time < nearest) { nearest = time; hostile = target; hit = null; }
      }
      if (hit || hostile) {
        this.impact.copy(this.start).lerp(this.end, nearest);
        shot.life = 0;
        const power = shot.damage ?? damage;
        if (hit) { hit.hp -= power; onHit(hit, this.impact, shot.kind); }
        if (hostile) combat!.hit(hostile, power, this.impact);
        if (shot.kind === 'plasma' || shot.kind === 'seeker') {
          onBlast(this.impact, shot.kind);
          const radius = shot.kind === 'plasma' ? PLASMA_RADIUS : SEEKER_BLAST_RADIUS;
          const areaPower = shot.kind === 'plasma' ? power : power * .4;
          for (const rock of rocks) {
            if (rock === hit || rock.wait > 0 || !alive()) continue;
            this.bodyAtImpact.copy(rock.previousPosition ?? rock.root.position).lerp(rock.root.position, nearest * this.frameFraction);
            const distance = Math.max(0, this.bodyAtImpact.distanceTo(this.impact) - rock.radius * .5);
            if (distance >= radius) continue;
            rock.hp -= areaPower * this.blastFalloff(distance, radius);
            onHit(rock, rock.root.position, shot.kind);
          }
          for (const target of combat?.targets ?? []) {
            if (target === hostile || !target.active || !alive()) continue;
            this.bodyAtImpact.copy(target.previousPosition ?? target.position).lerp(target.position, nearest * this.frameFraction);
            const distance = Math.max(0, this.bodyAtImpact.distanceTo(this.impact) - target.radius * .5);
            if (distance < radius) combat!.hit(target, areaPower * this.blastFalloff(distance, radius), target.position);
          }
        }
      }
      shot.mesh.position.copy(this.end);
      if (shot.life <= 0 || shot.range <= 1e-9) {
        this.scene.remove(shot.mesh);
        shot.target = null;
        this.spare.push(shot);
        this.shots.splice(i, 1);
      }
    }
  }

  reset(): void {
    for (const shot of this.shots) {
      this.scene.remove(shot.mesh);
      shot.target = null;
      this.spare.push(shot);
    }
    this.shots.length = 0;
  }

  private aimDirection(aim: T.Vector3): void {
    this.direction.copy(aim).sub(this.start);
    if (this.direction.lengthSq() < 1e-12) this.direction.copy(FORWARD);
    else this.direction.normalize();
  }

  private launch(kind: ProjectileKind, options: ShotOptions | undefined, target: CombatTarget | null): void {
    if (this.shots.length >= MAX_PLAYER_PROJECTILES) return;
    let shot = this.spare.pop();
    if (!shot) {
      if (this.allocated >= MAX_PLAYER_PROJECTILES) return;
      const mesh = new T.Mesh(this.geometries[kind], this.materials[kind]);
      const trail = new T.Mesh(this.trailGeometry, this.trailMaterial);
      trail.position.y = -1.35;
      trail.rotation.z = Math.PI;
      mesh.add(trail);
      shot = { mesh, trail, velocity: new T.Vector3(), forward: new T.Vector3(), life: 0, range: 0, kind, target: null };
      this.allocated++;
    }
    shot.kind = kind;
    shot.damage = options?.damage;
    shot.target = target;
    shot.forward.copy(this.direction);
    shot.velocity.copy(this.direction).multiplyScalar(SHOT_SPEED[kind]);
    shot.life = SHOT_RANGE[kind] / SHOT_SPEED[kind];
    shot.range = SHOT_RANGE[kind];
    shot.mesh.geometry = this.geometries[kind];
    shot.mesh.material = this.materials[kind];
    shot.mesh.position.copy(this.start);
    shot.mesh.quaternion.setFromUnitVectors(UP, this.direction);
    shot.trail.visible = kind === 'seeker';
    this.scene.add(shot.mesh);
    this.shots.push(shot);
  }

  private findLock(targets: readonly CombatTarget[], origin: T.Vector3, forward: T.Vector3): CombatTarget | null {
    let best: CombatTarget | null = null, bestScore = Infinity;
    for (const target of targets) {
      if (!target.active || target.hp <= 0) continue;
      this.desired.copy(target.position).sub(origin);
      const distance = this.desired.length();
      if (distance > SHOT_RANGE.seeker || distance < 1 || this.desired.dot(forward) <= 1) continue;
      const alignment = this.desired.multiplyScalar(1 / distance).dot(forward);
      if (alignment < .55) continue;
      // Ships win over a reactor fallback even when the larger reactor is nearer.
      const score = (target.kind === 'reactor' ? 1000 : 0) + distance + (1 - alignment) * 80;
      if (score < bestScore) { best = target; bestScore = score; }
    }
    return best;
  }

  private guide(shot: Projectile, dt: number): void {
    const target = shot.target;
    if (!target) return;
    this.desired.copy(target.position).sub(shot.mesh.position);
    if (!target.active || target.hp <= 0 || this.desired.lengthSq() < 1e-12) {
      shot.target = null;
      return;
    }
    this.desired.normalize();
    if (this.desired.dot(shot.forward) < .1) { shot.target = null; return; }
    this.direction.copy(shot.velocity).normalize();
    const angle = this.direction.angleTo(this.desired);
    if (angle > 1e-6) {
      this.turnAxis.crossVectors(this.direction, this.desired).normalize();
      this.direction.applyAxisAngle(this.turnAxis, Math.min(angle, SEEKER_TURN_RATE * Math.max(0, dt)));
      shot.velocity.copy(this.direction).multiplyScalar(SHOT_SPEED.seeker);
      shot.mesh.quaternion.setFromUnitVectors(UP, this.direction);
    }
  }

  private movingHit(previous: T.Vector3, position: T.Vector3, radius: number): number | null {
    // A short-range shot can expire part-way through a frame. Only that same
    // fraction of the body's movement belongs to its collision sweep.
    this.bodyAtImpact.copy(previous).lerp(position, this.frameFraction);
    return segmentSphereHit(this.start.x - previous.x, this.start.y - previous.y, this.start.z - previous.z,
      this.end.x - this.bodyAtImpact.x, this.end.y - this.bodyAtImpact.y, this.end.z - this.bodyAtImpact.z, 0, 0, 0, radius);
  }

  private blastFalloff(distance: number, radius: number): number {
    return .25 + .75 * (1 - distance / radius);
  }
}
