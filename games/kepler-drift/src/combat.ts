import type { Vector3 } from 'three';

/** World-space collision body shared by hostile ships and the exposed reactor. */
export interface CombatTarget {
  position: Vector3;
  previousPosition?: Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  active: boolean;
  kind: 'fighter' | 'sniper' | 'reactor';
  label: string;
}
