export type WeaponId = 'pulse' | 'plasma' | 'scatter' | 'seeker' | 'cutter';

export const BASE_WEAPON_DAMAGE = 14;
export const BASE_FIRE_INTERVAL = .19;
export const MAX_ENERGY_LEVEL = 5;
export const MAX_PLAYER_PROJECTILES = 160;

export const CUTTER_DURATION = 1.8;
export const CUTTER_RECHARGE = 12;
export const CUTTER_RANGE = 210;
export const CUTTER_WIDTH = .85;
export const PLASMA_RADIUS = 9;
export const PLASMA_PROXIMITY = .7;
export const SCATTER_PELLETS = 8;
export const SCATTER_RANGE = 72;
export const SEEKER_BLAST_RADIUS = 3.5;
export function cutterRecharge(level: number): number { return Math.max(7.2, CUTTER_RECHARGE - Math.max(0, level - 1) * .8); }

export const WEAPON_ORDER: readonly WeaponId[] = ['pulse', 'plasma', 'scatter', 'seeker', 'cutter'];
export const WEAPONS = {
  pulse: { name: 'Импульсы', icon: 'crosshair', key: '1', cost: 0, damage: 14, interval: .19, description: 'Быстрый точный огонь', role: 'Точность и постоянный урон. Два ствола, без ограничений по заряду.' },
  plasma: { name: 'Плазма', icon: 'orbit', key: '2', cost: 90, damage: 84, interval: .82, description: 'Мощный взрыв · 9 м', role: 'Разбивает скопления камней. Взрывается даже при близком пролёте; берегитесь красных астероидов.' },
  scatter: { name: 'Картечь', icon: 'expand', key: '3', cost: 140, damage: 13, interval: .55, description: 'Восемь зарядов · 72 м', role: 'Широкий ближний залп. Расчищает стену камней, но теряет точность на расстоянии.' },
  seeker: { name: 'Ракеты', icon: 'rocket', key: '4', cost: 220, damage: 68, interval: 1.4, description: 'Две ракеты · захват пиратов', role: 'Самостоятельно доворачивают к пиратам перед кораблём. Астероиды могут перехватить ракету.' },
  cutter: { name: 'Резак', icon: 'scan-line', key: '5', cost: 320, damage: 180, interval: 12, description: 'Сквозной луч · 1,8 с', role: 'Разрезает любые астероиды в прицеле. Повреждает открытый реактор, но не пробивает закрытую броню.' },
} as const;

export function weaponDamage(id: WeaponId, pulseDamage: number): number {
  return WEAPONS[id].damage * pulseDamage / BASE_WEAPON_DAMAGE;
}

/** Flight time is its only clock: pause and the equipment bay freeze all charges. */
export class WeaponBattery {
  selected: WeaponId = 'pulse';
  remaining = 0;
  cooldown = 0;
  recharge = CUTTER_RECHARGE;
  private readonly shotClocks: Record<WeaponId, number> = { pulse: 0, plasma: 0, scatter: 0, seeker: 0, cutter: 0 };

  get cutting(): boolean { return this.remaining > 0; }
  select(id: WeaponId): boolean {
    if (id === this.selected) return false;
    if (this.cutting) this.stopCutting();
    this.selected = id;
    return true;
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (const id of WEAPON_ORDER) this.shotClocks[id] = Math.max(0, this.shotClocks[id] - dt);
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
    } else {
      if (this.shotClocks[this.selected] > 0) return null;
      const intervalScale = Math.max(.09, fireInterval) / BASE_FIRE_INTERVAL;
      this.shotClocks[this.selected] = WEAPONS[this.selected].interval * intervalScale;
    }
    return this.selected;
  }
  stopCutting(): void {
    if (this.cutting) { this.remaining = 0; this.cooldown = this.recharge; }
  }
  reset(): void {
    this.selected = 'pulse';
    this.remaining = this.cooldown = 0;
    for (const id of WEAPON_ORDER) this.shotClocks[id] = 0;
    this.recharge = CUTTER_RECHARGE;
  }
}
