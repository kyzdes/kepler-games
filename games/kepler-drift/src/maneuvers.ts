export const ROLL_DURATION = 1.2;
export const ROLL_COOLDOWN = 2.4;
export const ROLL_DISTANCE = 4.8;
export const ROLL_PROTECTION = .52;
export const ROLL_HEIGHT = 2.2;

const ease = (p: number) => p * p * (3 - 2 * p);
export const rollHeight = (progress: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * ROLL_HEIGHT;
export const rollAngle = (progress: number): number => Math.PI * 2 * ease(Math.min(1, Math.max(0, progress)));

/** One deliberate roll per key press; the camera never inherits its rotation. */
export class BarrelRoll {
  private elapsed = ROLL_DURATION;
  direction: -1 | 1 = 1;
  cooldown = 0;
  get active(): boolean { return this.elapsed < ROLL_DURATION; }
  get height(): number { return this.active ? rollHeight(this.elapsed / ROLL_DURATION) : 0; }

  start(direction: number): boolean {
    if (Math.abs(direction) < .15 || this.active || this.cooldown > 0) return false;
    this.direction = direction < 0 ? -1 : 1;
    this.elapsed = 0; this.cooldown = ROLL_COOLDOWN;
    return true;
  }

  update(dt: number): { angle: number; lateral: number; lift: number; bank: number } {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) return { angle: 0, lateral: 0, lift: 0, bank: 0 };
    const before = this.elapsed / ROLL_DURATION;
    this.elapsed = Math.min(ROLL_DURATION, this.elapsed + dt);
    const after = this.elapsed / ROLL_DURATION;
    return {
      angle: -this.direction * rollAngle(after),
      lateral: this.direction * ROLL_DISTANCE * (ease(after) - ease(before)),
      lift: rollHeight(after) - rollHeight(before),
      bank: -this.direction * Math.sin(after * Math.PI) * .2,
    };
  }

  reset(): void { this.elapsed = ROLL_DURATION; this.cooldown = 0; }
}
