import * as T from 'three';
import type { CombatTarget } from './combat.ts';
import type { Rock } from './asteroids.ts';
import { createPirateModel } from './pirate-models.ts';
import { EnemyProjectiles } from './enemy-projectiles.ts';
import type { EnemyShotContext } from './enemy-projectiles.ts';
import { ATTACK_LOCK, advancePirateAttack, damagePirate, MAX_PIRATES, piratePressure, PIRATE_GRACE_SECONDS, shouldSpawnPirate } from './pirate-rules.ts';
import type { PirateAttackClock, PirateKind, ShotCover } from './pirate-rules.ts';

export interface Pirate extends CombatTarget {
  kind: PirateKind;
  model: ReturnType<typeof createPirateModel>;
  root: T.Group;
  attack: PirateAttackClock;
  lockedAim: T.Vector3;
  readonly charging: boolean;
  readonly cooldown: number;
}

export interface PirateContext {
  sector: number;
  sectorTime: number;
  elapsed: number;
  player: T.Vector3;
  worldSpeed: number;
  rocks: readonly Rock[];
  bossActive: boolean;
  intersectsPlayer?: (from: T.Vector3, to: T.Vector3, radius: number) => boolean;
}

interface PirateRuntime extends Pirate {
  previousPosition: T.Vector3;
  age: number;
  side: number;
  wave: number;
  startY: number;
  shotIndex: number;
  flameBaseY: number[];
}

interface Telegraph {
  line: T.Line;
  geometry: T.BufferGeometry;
  positions: Float32Array;
  distances: Float32Array;
  material: T.LineDashedMaterial;
  mark: T.Mesh;
}

interface RockMotion extends ShotCover {
  source: Rock;
  previous: T.Vector3;
  wasActive: boolean;
}

export interface PirateHooks {
  hitPlayer(amount: number, reason: string): void;
  destroyed(enemy: Pirate): void;
  shot(): void;
}

/** Two readable pirate patterns, bounded model/bolt pools and no camera effects. */
export class PirateFleet {
  readonly enemies: PirateRuntime[] = [];
  private readonly projectiles: EnemyProjectiles;
  private readonly targetList: CombatTarget[] = [];
  private readonly warnings: Telegraph[] = [];
  private readonly covers: RockMotion[] = [];
  private readonly previousPlayer = new T.Vector3();
  private readonly shotContext: EnemyShotContext = { player: this.previousPlayer, previousPlayer: this.previousPlayer, covers: this.covers };
  private readonly onPlayerHit = (amount: number, reason: string): void => this.hooks.hitPlayer(amount, reason);
  private readonly muzzle = new T.Vector3();
  private readonly aim = new T.Vector3();
  private playerSeen = false;
  private spawnCooldown = PIRATE_GRACE_SECONDS;
  private pressureSector = 1;
  private interval = 12;
  private readonly reducedMotion: boolean;
  private readonly rng: () => number;
  private readonly hooks: PirateHooks;

  constructor(scene: T.Scene, rng: () => number, hooks: PirateHooks, reducedMotion = false) {
    this.rng = rng; this.hooks = hooks; this.reducedMotion = reducedMotion;
    this.projectiles = new EnemyProjectiles(scene);
    const markerGeometry = new T.RingGeometry(1.65, 1.78, 32);
    for (let i = 0; i < MAX_PIRATES; i++) {
      const kind: PirateKind = i < 3 ? 'fighter' : 'sniper';
      const model = createPirateModel(kind), root = model.root;
      const attack: PirateAttackClock = { phase: 'cooldown', remaining: 0, shotsLeft: 0 };
      root.visible = false; scene.add(root);
      this.enemies.push({
        kind, model, root, position: root.position, previousPosition: new T.Vector3(), radius: kind === 'fighter' ? 2.4 : 3,
        hp: 0, maxHp: 0, active: false, label: kind === 'fighter' ? 'ПИРАТ · ПЕРЕХВАТЧИК' : 'ПИРАТ · СНАЙПЕР',
        attack, lockedAim: new T.Vector3(), age: 0, side: 1, wave: 0, startY: 0, shotIndex: 0,
        flameBaseY: model.flames.map(flame => flame.scale.y),
        get charging() { return attack.phase === 'charging'; },
        get cooldown() { return attack.phase === 'cooldown' ? attack.remaining : 0; },
      });
      const positions = new Float32Array(6), distances = new Float32Array(2);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
      geometry.setAttribute('lineDistance', new T.BufferAttribute(distances, 1).setUsage(T.DynamicDrawUsage));
      const material = new T.LineDashedMaterial({
        color: kind === 'sniper' ? 0xff4169 : 0xff7741,
        dashSize: kind === 'sniper' ? 1.2 : .8, gapSize: .8,
        transparent: true, opacity: .6, toneMapped: false, depthWrite: false,
      });
      const line = new T.Line(geometry, material);
      line.frustumCulled = false; line.visible = false; scene.add(line);
      const mark = new T.Mesh(markerGeometry, new T.MeshBasicMaterial({
        color: 0xff4169, transparent: true, opacity: .65, depthWrite: false, toneMapped: false, side: T.DoubleSide,
      }));
      mark.visible = false; scene.add(mark);
      this.warnings.push({ line, geometry, positions, distances, material, mark });
    }
  }

  get count(): number {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.active) count++;
    return count;
  }
  get shotCount(): number { return this.projectiles.count; }
  get shots(): number { return this.projectiles.count; }
  get targets(): CombatTarget[] {
    this.targetList.length = 0;
    for (const enemy of this.enemies) if (enemy.active) this.targetList.push(enemy);
    return this.targetList;
  }

  reset(): void {
    for (let i = 0; i < this.enemies.length; i++) this.retire(this.enemies[i], i);
    this.projectiles.reset(); this.targetList.length = 0; this.covers.length = 0;
    this.spawnCooldown = PIRATE_GRACE_SECONDS; this.playerSeen = false; this.pressureSector = 1; this.interval = 12;
  }

  update(dt: number, context: PirateContext): void {
    if (context.bossActive) {
      for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].active) this.retire(this.enemies[i], i);
      this.projectiles.reset(); this.spawnCooldown = Math.max(this.spawnCooldown, 4);
      this.previousPlayer.copy(context.player); this.playerSeen = true;
      return;
    }
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (!this.playerSeen) { this.previousPlayer.copy(context.player); this.playerSeen = true; }
    this.syncCover(context.rocks);
    if (context.sector !== this.pressureSector) {
      this.pressureSector = context.sector; this.interval = piratePressure(context.sector).interval;
    }
    this.spawnCooldown = Math.max(-1, this.spawnCooldown - dt);
    if (shouldSpawnPirate(context.sector, context.elapsed, this.count, this.spawnCooldown, false)) {
      this.spawn(context); this.spawnCooldown = this.interval * (.9 + this.rng() * .2);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.active) continue;
      enemy.previousPosition.copy(enemy.position);
      enemy.age += dt;
      const departing = enemy.age > (enemy.kind === 'fighter' ? 14 : 18);
      if (departing) {
        this.warnings[i].line.visible = this.warnings[i].mark.visible = false;
        enemy.attack.phase = 'cooldown'; enemy.attack.remaining = 0;
        enemy.position.x += enemy.side * dt * 10;
        enemy.position.z += dt * (Math.min(60, context.worldSpeed) + 24);
        enemy.root.rotation.z = enemy.side * .28;
        if (enemy.position.z > context.player.z + 16 || Math.abs(enemy.position.x - context.player.x) > 60) this.retire(enemy, i);
        continue;
      }
      const entrance = Math.min(1, enemy.age / Math.max(1.8, 2.8 - Math.max(0, context.worldSpeed - 18) * .02));
      const eased = entrance * entrance * (3 - 2 * entrance);
      const lateral = enemy.kind === 'fighter' ? 9 : 7;
      const desiredX = context.player.x * .22 + enemy.side * 26 * (1 - eased) + Math.sin(enemy.age * (enemy.kind === 'fighter' ? .86 : .31) + enemy.wave) * lateral;
      const desiredY = enemy.startY * .55 + Math.sin(enemy.age * .55 + enemy.wave) * (enemy.kind === 'fighter' ? 2.4 : 1.1);
      const desiredZ = context.player.z - 145 + eased * (enemy.kind === 'fighter' ? 78 : 58) + Math.sin(enemy.age * .5 + enemy.wave) * 5;
      const smoothing = 1 - Math.exp(-dt * 2.8);
      enemy.position.x += (desiredX - enemy.position.x) * smoothing;
      enemy.position.y += (desiredY - enemy.position.y) * smoothing;
      enemy.position.z += (desiredZ - enemy.position.z) * smoothing;
      enemy.root.rotation.y = T.MathUtils.clamp((context.player.x - enemy.position.x) * .008, -.35, .35);
      enemy.root.rotation.x = T.MathUtils.clamp(-(context.player.y - enemy.position.y) * .013, -.2, .2);
      enemy.root.rotation.z = this.reducedMotion ? 0 : Math.cos(enemy.age * .86 + enemy.wave) * (enemy.kind === 'fighter' ? .16 : .04);
      for (let flame = 0; flame < enemy.model.flames.length; flame++) enemy.model.flames[flame].scale.y = enemy.flameBaseY[flame] * (this.reducedMotion ? 1 : 1 + Math.sin(enemy.age * 24 + enemy.wave) * .065);
      if (enemy.age < 2.8) continue;
      const event = advancePirateAttack(enemy.attack, enemy.kind, dt);
      if (event & ATTACK_LOCK) {
        enemy.lockedAim.copy(context.player);
        if (enemy.kind === 'fighter') { enemy.lockedAim.x += (this.rng() - .5) * 1.2; enemy.lockedAim.y += (this.rng() - .5) * .8; }
      }
      const shotsDue = event >> 1;
      for (let shot = 0; shot < shotsDue; shot++) {
        const muzzles = enemy.model.muzzles;
        (muzzles[enemy.shotIndex++ % Math.max(1, muzzles.length)] ?? enemy.root).getWorldPosition(this.muzzle);
        this.aim.copy(enemy.lockedAim);
        if (this.projectiles.fire(this.muzzle, this.aim, enemy.kind, context.sector)) this.hooks.shot();
      }
      this.updateWarning(enemy, this.warnings[i]);
    }
    this.shotContext.player = context.player; this.shotContext.intersectsPlayer = context.intersectsPlayer;
    this.projectiles.update(dt, this.shotContext, this.onPlayerHit);
    this.previousPlayer.copy(context.player);
    for (const cover of this.covers) { cover.previous.copy(cover.position); cover.wasActive = cover.active; }
  }

  hit(target: CombatTarget, damage: number): void {
    const i = this.enemies.indexOf(target as PirateRuntime);
    if (i < 0) return;
    const enemy = this.enemies[i];
    if (damagePirate(enemy, damage) !== 'destroyed') return;
    this.retire(enemy, i);
    this.hooks.destroyed(enemy);
  }

  blast(position: T.Vector3, radius: number, damage: number): void {
    if (!(radius > 0) || !(damage > 0)) return;
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const distance = Math.max(0, enemy.position.distanceTo(position) - enemy.radius * .5);
      if (distance < radius) this.hit(enemy, damage * (1 - distance / radius));
    }
  }

  private spawn(context: PirateContext): void {
    const preferred: PirateKind = context.sector >= 2 && this.rng() < .38 ? 'sniper' : 'fighter';
    const enemy = this.enemies.find(candidate => !candidate.active && candidate.kind === preferred) ?? this.enemies.find(candidate => !candidate.active);
    if (!enemy) return;
    const level = Math.min(9, Math.max(0, context.sector - 1));
    enemy.maxHp = (enemy.kind === 'fighter' ? 56 : 80) + level * (enemy.kind === 'fighter' ? 6 : 8);
    enemy.hp = enemy.maxHp; enemy.active = true; enemy.root.visible = true; enemy.age = 0;
    enemy.side = this.rng() < .5 ? -1 : 1; enemy.wave = this.rng() * Math.PI * 2; enemy.startY = (this.rng() - .5) * 9;
    enemy.position.set(context.player.x + enemy.side * 26, enemy.startY, context.player.z - 145);
    enemy.previousPosition.copy(enemy.position);
    enemy.root.rotation.set(0, 0, 0); enemy.shotIndex = 0;
    enemy.attack.phase = 'cooldown'; enemy.attack.remaining = .7 + this.rng() * .6; enemy.attack.shotsLeft = 0;
    enemy.lockedAim.copy(context.player);
  }

  private retire(enemy: PirateRuntime, index: number): void {
    enemy.active = false; enemy.root.visible = false;
    enemy.attack.phase = 'cooldown'; enemy.attack.remaining = 0; enemy.attack.shotsLeft = 0;
    this.warnings[index].line.visible = this.warnings[index].mark.visible = false;
  }

  private updateWarning(enemy: PirateRuntime, warning: Telegraph): void {
    warning.line.visible = enemy.charging; warning.mark.visible = enemy.charging && enemy.kind === 'sniper';
    if (!enemy.charging) return;
    (enemy.model.muzzles[0] ?? enemy.root).getWorldPosition(this.muzzle);
    const points = warning.positions;
    points[0] = this.muzzle.x; points[1] = this.muzzle.y; points[2] = this.muzzle.z;
    points[3] = enemy.lockedAim.x; points[4] = enemy.lockedAim.y; points[5] = enemy.lockedAim.z - .35;
    warning.distances[1] = this.muzzle.distanceTo(enemy.lockedAim);
    warning.geometry.attributes.position.needsUpdate = warning.geometry.attributes.lineDistance.needsUpdate = true;
    warning.material.opacity = enemy.kind === 'sniper' ? .7 : .38;
    warning.mark.position.copy(enemy.lockedAim); warning.mark.position.z -= .35;
  }

  private syncCover(rocks: readonly Rock[]): void {
    let changed = rocks.length !== this.covers.length;
    if (!changed) for (let i = 0; i < rocks.length; i++) if (rocks[i] !== this.covers[i].source) { changed = true; break; }
    if (changed) {
      this.covers.length = 0;
      for (const rock of rocks) this.covers.push({ source: rock, position: rock.root.position, previous: rock.root.position.clone(), radius: rock.radius * .93, active: rock.wait <= 0, wasActive: rock.wait <= 0 });
    }
    for (const cover of this.covers) {
      cover.active = cover.source.wait <= 0 && cover.source.root.visible;
      cover.radius = cover.source.radius * .93;
      // Asteroid recycling teleports it; that jump is not a solid collision sweep.
      if (!cover.wasActive || cover.previous.distanceToSquared(cover.position as T.Vector3) > 2500) cover.previous.copy(cover.position);
    }
  }
}
