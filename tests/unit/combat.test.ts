import { describe, expect, it } from 'vitest';
import { attackFor, COMBO_WINDOW, inStrike, nextCombo, resolveHit, weaponStats } from '@/systems/combat';

describe('cận chiến', () => {
  it('combo 3 nhịp vòng lại; nghỉ lâu thì về nhịp đầu', () => {
    expect(nextCombo(0, 0.2)).toBe(1);
    expect(nextCombo(1, 0.2)).toBe(2);
    expect(nextCombo(2, 0.2)).toBe(0);
    expect(nextCombo(1, COMBO_WINDOW + 0.1)).toBe(0);
  });

  it('tay không thì đấm, cầm vũ khí thì chém; mã tấu mạnh + xa + chậm hơn tay không; nhịp cuối đánh ngã', () => {
    const jab = attackFor(null, 0, false);
    const slash = attackFor('maTau', 0, false);
    expect(jab.clip).toBe('jab');
    expect(slash.clip).toBe('slashA');
    expect(slash.damage).toBeGreaterThan(jab.damage * 2);
    expect(slash.reach).toBeGreaterThan(jab.reach);
    expect(slash.duration).toBeGreaterThan(attackFor(null, 0, false).duration);
    expect(attackFor(null, 2, false).knock).toBe(true);
    expect(attackFor(null, 0, true).knock).toBe(true);
    expect(attackFor('daoBam', 0, false).duration).toBeLessThan(attackFor('maTau', 0, false).duration);
    expect(weaponStats('banhMi' as never)).toEqual(weaponStats(null));
  });

  it('chỉ trúng người trong tầm và trong quạt phía trước', () => {
    // Nhìn về +Z (yaw 0).
    expect(inStrike(0, 0, 0, 1.1, 0.7, 0, 1)).toBe(true);
    expect(inStrike(0, 0, 0, 1.1, 0.7, 0, 2)).toBe(false); // xa quá
    expect(inStrike(0, 0, 0, 1.1, 0.7, 0, -1)).toBe(false); // sau lưng
    expect(inStrike(0, 0, 0, 1.1, 0.7, 1, 0.3)).toBe(false); // bên cạnh, ngoài quạt
    expect(inStrike(0, 0, Math.PI / 2, 1.1, 0.7, 1, 0)).toBe(true); // quay sang +X
    expect(inStrike(0, 0, 0, 1.1, 0.7, 0.1, -0.2)).toBe(true); // sát người
  });

  it('mất máu; đòn ngã hoặc mất nhiều máu một lần thì ngã; hết máu thì gục', () => {
    expect(resolveHit(100, 100, 10, false)).toEqual({ health: 90, result: 'hurt' });
    expect(resolveHit(100, 100, 10, true)).toEqual({ health: 90, result: 'down' });
    expect(resolveHit(100, 100, 40, false).result).toBe('down');
    expect(resolveHit(20, 100, 30, false)).toEqual({ health: 0, result: 'dead' });
  });
});
