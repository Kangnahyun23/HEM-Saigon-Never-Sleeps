import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NearPedestrianView } from '@/ai/nearPedestrians';
import { NPC_ACTION as A } from '@/ai/npcBody';
import type { Walker } from '@/ai/pedestrians';
import { FakePool } from './fakeNpc';

/** Người đi bộ tối thiểu cho hình vẽ: đứng / đi thong thả ở (x, z), mẫu người 0 (nam). */
const walker = (id: number, x: number, z: number, speed: number): Walker =>
  ({ id, generation: 1, look: 0, x, z, prevX: x, prevZ: z, yaw: 0, prevYaw: 0, speed, dead: false, down: 0, hurt: 0, flee: 0, dodge: 0, enter: 0, punch: 0, react: 'none' }) as unknown as Walker;

const sum = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0);

describe('người đi bộ gần camera vẽ bằng nhân vật có xương', () => {
  // Biểu tượng gọi điện vẽ bằng canvas: Node không có DOM ⇒ canvas giả (không vẽ gì).
  beforeAll(() => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) }));
  afterAll(() => vi.unstubAllGlobals());

  it('vừa lấy hình từ kho: vào ngay động tác đích, không trộn dần từ tư thế gốc chữ T (dang tay)', () => {
    const pool = new FakePool();
    const view = new NearPedestrianView(1, pool);
    view.update([walker(0, 3, 0, 1.4)], 1, 1 / 60, 0, 0);
    const npc = pool.last!;
    // Tổng trọng số thiếu bao nhiêu thì bộ trộn lấy tư thế gốc chữ T bù vào bấy nhiêu.
    expect(npc.weights[A.walk]).toBe(1);
    expect(sum(npc.weights)).toBe(1);
  });

  it('người mới vào tầm lúc game đang dừng (dt = 0) cũng không dang tay', () => {
    const pool = new FakePool();
    const view = new NearPedestrianView(1, pool);
    view.update([walker(0, 3, 0, 0)], 1, 0, 0, 0);
    expect(sum(pool.last!.weights)).toBe(1);
  });

  it('người đã gục từ trước mới vào tầm: nằm sẵn ở cuối động tác ngã, không đứng dậy ngã lại', () => {
    const pool = new FakePool();
    const view = new NearPedestrianView(1, pool);
    const w = walker(0, 3, 0, 0);
    w.dead = true;
    view.update([w], 1, 1 / 60, 0, 0);
    const npc = pool.last!;
    const fall = npc.actions[npc.weights.indexOf(1)]!;
    expect(fall.getClip().name).toMatch(/^death/);
    expect(fall.time).toBe(fall.getClip().duration);
  });

  it('gục ngay trong tầm thì phát động tác ngã từ đầu', () => {
    const pool = new FakePool();
    const view = new NearPedestrianView(1, pool);
    const w = walker(0, 3, 0, 1.4);
    view.update([w], 1, 1 / 60, 0, 0);
    w.dead = true;
    view.update([w], 1, 1 / 60, 0, 0);
    const npc = pool.last!;
    const fall = npc.actions.find((a) => a.getClip().name.startsWith('death') && a.getEffectiveWeight() > 0)!;
    expect(fall.time).toBeLessThan(0.1);
  });

  it('đổi động tác về sau vẫn trộn dần (chỉ khung đầu vào thẳng)', () => {
    const pool = new FakePool();
    const view = new NearPedestrianView(1, pool);
    const w = walker(0, 3, 0, 1.4);
    view.update([w], 1, 1 / 60, 0, 0);
    w.speed = 0;
    view.update([w], 1, 1 / 60, 0, 0);
    const walk = pool.last!.weights[A.walk]!;
    expect(walk).toBeGreaterThan(0.5);
    expect(walk).toBeLessThan(1);
  });
});
