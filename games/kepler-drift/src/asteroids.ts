import type { Group, Vector3 } from 'three';
import type { AsteroidKind } from './hazards.ts';

export interface Rock {
  root: Group;
  /** Start of the current simulation step; a respawn resets it to the new position. */
  previousPosition?: Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  ore: boolean;
  kind: AsteroidKind;
  spin: Vector3;
  wait: number;
}
