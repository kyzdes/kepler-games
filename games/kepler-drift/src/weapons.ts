export type WeaponId = 'pulse' | 'plasma' | 'cutter';

export const CUTTER_DURATION = 1.8;
export const CUTTER_RECHARGE = 12;
export const CUTTER_RANGE = 210;
export const CUTTER_WIDTH = .85;
export const PLASMA_RADIUS = 7;
export function cutterRecharge(level: number): number { return Math.max(7.2, CUTTER_RECHARGE - Math.max(0, level - 1) * .8); }

export const WEAPON_ORDER: readonly WeaponId[] = ['pulse', 'plasma', 'cutter'];
export const WEAPONS = {
  pulse: { name: 'Импульсы', icon: 'crosshair', key: '1', description: 'Быстрый точный огонь' },
  plasma: { name: 'Плазма', icon: 'orbit', key: '2', description: 'Взрыв по площади · 7 м' },
  cutter: { name: 'Резак', icon: 'scan-line', key: '3', description: 'Сквозной луч · 1,8 с' },
} as const;

/** Flight time is its only clock: pause and the equipment bay freeze all charges. */
export class WeaponBattery {
  selected: WeaponId = 'pulse';
  remaining = 0;
  cooldown = 0;
  recharge = CUTTER_RECHARGE;
  private pulseClock = 0;
  private plasmaClock = 0;

  get cutting(): boolean { return this.remaining > 0; }
  select(id: WeaponId): boolean {
    if (id === this.selected) return false;
    if (this.cutting) this.stopCutting();
    this.selected = id;
    return true;
  }
  update(dt: number): void {
    this.pulseClock = Math.max(0, this.pulseClock - dt);
    this.plasmaClock = Math.max(0, this.plasmaClock - dt);
    const burn = Math.min(this.remaining, dt);
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining < 1e-9) this.remaining = 0;
    if (burn > 0 && !this.cutting) this.cooldown = this.recharge;
    this.cooldown = Math.max(0, this.cooldown - (dt - burn));
  }
  fire(fireInterval: number, trigger: boolean, auto: boolean, hasTarget: boolean): WeaponId | null {
    if (!trigger && !auto) return null;
    if (this.selected === 'cutter') {
      // Auto fire does not spend the beam on an empty aiming lane.
      if (this.cutting || this.cooldown > 0 || (!trigger && !hasTarget)) return null;
      this.remaining = CUTTER_DURATION;
    } else if (this.selected === 'plasma') {
      if (this.plasmaClock > 0) return null;
      this.plasmaClock = fireInterval * 4.5;
    } else {
      if (this.pulseClock > 0) return null;
      this.pulseClock = fireInterval;
    }
    return this.selected;
  }
  stopCutting(): void {
    if (this.cutting) { this.remaining = 0; this.cooldown = this.recharge; }
  }
  reset(): void {
    this.selected = 'pulse';
    this.remaining = this.cooldown = this.pulseClock = this.plasmaClock = 0;
    this.recharge = CUTTER_RECHARGE;
  }
}
