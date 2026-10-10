import { describe, expect, it } from 'vitest';
import { formatCount, generateFeed, type FeedContext } from '@/systems/social';

const calm: FeedContext = { heat: 0, raining: false, debt: 0, hour: 10 };

describe('mạng xã hội "Phây"', () => {
  it('cùng seed, ngày, khung giờ ⇒ cùng bảng tin; khung giờ khác ⇒ bài khác', () => {
    expect(generateFeed(1, 2, calm)).toEqual(generateFeed(1, 2, { ...calm, hour: 11 }));
    expect(generateFeed(1, 2, calm)).not.toEqual(generateFeed(1, 2, { ...calm, hour: 16 }));
  });

  it('luôn chen một quảng cáo app vay được tài trợ; bài thường không trùng nhau', () => {
    const feed = generateFeed(7, 1, calm);
    expect(feed.filter((p) => p.sponsored)).toHaveLength(1);
    const texts = feed.map((p) => p.text);
    expect(new Set(texts).size).toBe(texts.length);
    for (const p of feed) {
      expect(p.text.length).toBeGreaterThan(10);
      expect(p.likes).toBeGreaterThanOrEqual(0);
    }
  });

  it('phản ứng theo diễn biến: bị rượt ⇒ bài nóng về Tín đứng đầu; mưa ⇒ bài ngập; còn nợ ⇒ bài app vay đòi nợ', () => {
    const feed = generateFeed(3, 1, { heat: 2, raining: true, debt: 30_000_000, hour: 20 });
    expect(feed[0]!.hot).toBe(true);
    expect(feed[0]!.text).toContain('thùng giao hàng cam');
    expect(feed.some((p) => p.text.includes('đầu gối'))).toBe(true);
    expect(feed.some((p) => p.author === 'Hội Nạn Nhân App Vay')).toBe(true);
    expect(generateFeed(3, 1, calm).some((p) => p.hot)).toBe(false);
  });

  it('định dạng lượt thích', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(1234)).toBe('1,2K');
    expect(formatCount(15400)).toBe('15K');
  });
});
