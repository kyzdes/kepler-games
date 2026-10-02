import * as T from 'three';
import { firstCoverHit, firstEnemyImpact, MAX_ENEMY_SHOTS } from './pirate-rules.ts';
import type { PirateKind, ShotCover } from './pirate-rules.ts';

interface EnemyShot {
  mesh: T.Mesh;
  velocity: T.Vector3;
  active: boolean;
  life: number;
  damage: number;
  radius: number;
  kind: PirateKind;
}

export interface EnemyShotContext {
  player: T.Vector3;
  previousPlayer: T.Vector3;
  covers: readonly ShotCover[];
  intersectsPlayer?: (from: T.Vector3, to: T.Vector3, radius: number) => boolean;
}

const UP = new T.Vector3(0, 1, 0);

/** A fixed pool of hostile bolts. Rocks absorb them without changing rock state. */
export class EnemyProjectiles {
  private readonly pool: EnemyShot[] = [];
  private readonly start = new T.Vector3();
  private readonly end = new T.Vector3();
  private readonly clippedEnd = new T.Vector3();
  private readonly direction = new T.Vector3();
  private readonly geometry = new T.CylinderGeometry(.055, .10, 1.7, 6);
  private readonly fighterMaterial = new T.MeshBasicMaterial({ color: new T.Color(3.4, .22, .08), toneMapped: false });
  private readonly sniperMaterial = new T.MeshBasicMaterial({ color: new T.Color(3, .08, .5), toneMapped: false });

  constructor(scene: T.Scene) {
    for (let i = 0; i < MAX_ENEMY_SHOTS; i++) {
      const mesh = new T.Mesh(this.geometry, this.fighterMaterial);
      mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh);
      this.pool.push({ mesh, velocity: new T.Vector3(), active: false, life: 0, damage: 0, radius: .12, kind: 'fighter' });
    }
  }

  get count(): number {
    let active = 0;
    for (const shot of this.pool) if (shot.active) active++;
    return active;
  }

  fire(origin: T.Vector3, aim: T.Vector3, kind: PirateKind, sector: number): boolean {
    const shot = this.pool.find(candidate => !candidate.active);
    if (!shot) return false;
    this.direction.copy(aim).sub(origin);
    if (this.direction.lengthSq() < 1e-8 || this.direction.z <= 0) return false;
    this.direction.normalize();
    shot.kind = kind; shot.active = true; shot.life = 3;
    shot.radius = kind === 'sniper' ? .22 : .12;
    shot.damage = (kind === 'sniper' ? 25 : 11) + Math.min(5, Math.max(0, sector - 1)) * (kind === 'sniper' ? 1.6 : .7);
    shot.velocity.copy(this.direction).multiplyScalar(kind === 'sniper' ? 120 : 90);
    shot.mesh.material = kind === 'sniper' ? this.sniperMaterial : this.fighterMaterial;
    shot.mesh.scale.set(kind === 'sniper' ? 1.5 : 1, kind === 'sniper' ? 1.6 : 1, kind === 'sniper' ? 1.5 : 1);
    shot.mesh.position.copy(origin); shot.mesh.quaternion.setFromUnitVectors(UP, this.direction); shot.mesh.visible = true;
    return true;
  }

  update(dt: number, context: EnemyShotContext, hitPlayer: (amount: number, reason: string) => void): void {
    for (const shot of this.pool) {
      if (!shot.active) continue;
      this.start.copy(shot.mesh.position); this.end.copy(this.start).addScaledVector(shot.velocity, dt);
      let impact: 'player' | 'cover' | null = null;
      if (context.intersectsPlayer) {
        const coverTime = firstCoverHit(this.start, this.end, context.covers, shot.radius);
        this.clippedEnd.copy(this.end);
        if (coverTime !== null) this.clippedEnd.copy(this.start).lerp(this.end, coverTime);
        // The existing compound hull collider resolves wings and banking. Clip at
        // the first rock so a hull behind cover cannot receive a blocked bolt.
        if (context.intersectsPlayer(this.start, this.clippedEnd, shot.radius)) impact = 'player';
        else if (coverTime !== null) impact = 'cover';
      } else {
        impact = firstEnemyImpact(this.start, this.end, context.previousPlayer, context.player, context.covers, shot.radius)?.kind ?? null;
      }
      shot.life -= dt;
      shot.mesh.position.copy(this.end);
      if (impact || shot.life <= 0 || shot.mesh.position.z > context.player.z + 25) {
        // Remove before invoking game hooks: fatal damage or a reset is reentrant.
        shot.active = false; shot.mesh.visible = false;
        if (impact === 'player') hitPlayer(shot.damage, shot.kind === 'sniper' ? 'Выстрел снайпера' : 'Пиратская очередь');
      }
    }
  }

  reset(): void {
    for (const shot of this.pool) { shot.active = false; shot.life = 0; shot.mesh.visible = false; }
  }
}
