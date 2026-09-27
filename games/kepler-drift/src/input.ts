/** A joystick release must never cancel a different finger's fire gesture. */
export class PointerFire {
  private pointers = new Set<number>();
  get active(): boolean { return this.pointers.size > 0; }
  press(pointerId: number): void { this.pointers.add(pointerId); }
  release(pointerId: number): void { this.pointers.delete(pointerId); }
  clear(): void { this.pointers.clear(); }
}

export function horizontalInput(keys: ReadonlySet<string>, touch = 0): number {
  return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
    - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch;
}

/** Accept either order of the chord; key repeats never queue another roll. */
export function rollDirection(keys: ReadonlySet<string>, changedKey: string, repeat: boolean): number {
  if (repeat || !keys.has('Space') || !['Space', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(changedKey)) return 0;
  return horizontalInput(keys);
}
