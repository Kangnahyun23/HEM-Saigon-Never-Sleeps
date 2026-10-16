import { describe, expect, it } from 'vitest';
import { Input } from '@/core/input';

/** Cửa sổ giả: test giả lập phím bằng setKey, không cần sự kiện thật. */
const fakeWindow = { addEventListener: () => undefined } as unknown as Window;

describe('Input', () => {
  it('phím đang giữ / vừa nhấn / trục, với một hoặc nhiều mã phím', () => {
    const input = new Input(fakeWindow);
    expect(input.isDown('KeyW')).toBe(false);
    input.setKey('KeyW', true);
    input.setKey('ShiftRight', true);
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.isDown('ShiftLeft', 'ShiftRight')).toBe(true);
    expect(input.isDown('KeyA', 'KeyS', 'KeyD', 'ArrowUp')).toBe(false);
    expect(input.wasPressed('Digit1', 'Digit2', 'Digit3', 'KeyW')).toBe(true);
    expect(input.wasPressed('Digit1', 'Digit2')).toBe(false);
    expect(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).toBe(1);
    expect(input.axis(['KeyA'], ['KeyD'])).toBe(0);
    input.endFrame();
    // Giữ phím sang khung hình sau: vẫn "đang giữ" nhưng không còn "vừa nhấn" (lặp phím của hệ điều hành cũng vậy).
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.wasPressed('KeyW')).toBe(false);
    input.setKey('KeyW', true);
    expect(input.wasPressed('KeyW')).toBe(false);
    input.setKey('KeyW', false);
    input.setKey('ArrowDown', true);
    expect(input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).toBe(-1);
    expect(input.wasPressed('ArrowDown')).toBe(true);
  });
});
