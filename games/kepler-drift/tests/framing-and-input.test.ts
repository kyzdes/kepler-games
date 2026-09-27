import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerFire } from '../src/input.ts';

test('releasing the joystick cannot release the independently held firing finger', () => {
  const input = new PointerFire(); input.press(12);
  input.release(3); assert.equal(input.active, true);
  input.release(12); assert.equal(input.active, false);
});
test('multiple fire pointers and a pause clear have independent, deterministic lifetimes', () => {
  const input = new PointerFire(); input.press(4); input.press(9); input.release(4);
  assert.equal(input.active, true); input.clear(); assert.equal(input.active, false);
  input.release(9); assert.equal(input.active, false);
});
