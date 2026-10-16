import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { addNightOnly, addWetNightOnly, setNightLevel, setWetLevel, wetUniform } from '@/world/nightGlow';

/** Vật giả: module chỉ bật / tắt `visible`. */
const thing = (): THREE.Object3D => ({ visible: true }) as THREE.Object3D;

describe('vật chỉ vẽ ban đêm', () => {
  it('vệt phản chiếu đường ướt chỉ vẽ khi tối VÀ đường ướt; vật ban đêm thường chỉ cần tối', () => {
    setNightLevel(0);
    setWetLevel(0);
    const glow = thing();
    const streak = thing();
    addNightOnly(glow);
    addWetNightOnly(streak);
    expect(glow.visible).toBe(false);
    expect(streak.visible).toBe(false);
    setNightLevel(1);
    expect(glow.visible).toBe(true);
    // Đêm khô: vệt sáng bằng 0 — khỏi vẽ.
    expect(streak.visible).toBe(false);
    setWetLevel(0.6);
    expect(wetUniform.value).toBe(0.6);
    expect(streak.visible).toBe(true);
    // Trời sáng, đường còn ướt.
    setNightLevel(0);
    expect(glow.visible).toBe(false);
    expect(streak.visible).toBe(false);
  });
});
