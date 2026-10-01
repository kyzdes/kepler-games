import type { Group, Vector3 } from 'three';
import type { AsteroidKind } from './hazards.ts';

export interface Rock {
  root: Group;
  radius: number;
  hp: number;
  maxHp: number;
  ore: boolean;
  kind: AsteroidKind;
  spin: Vector3;
  wait: number;
}
