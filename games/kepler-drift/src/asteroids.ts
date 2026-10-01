import type { Group, Vector3 } from 'three';

export interface Rock {
  root: Group;
  radius: number;
  hp: number;
  maxHp: number;
  ore: boolean;
  spin: Vector3;
  wait: number;
}
