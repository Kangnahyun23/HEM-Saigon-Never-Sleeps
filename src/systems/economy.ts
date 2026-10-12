/**
 * Các khoản mất tiền ngoài ý muốn (thuần logic, có unit test): nộp phạt khi bị công an bắt, viện phí khi gục,
 * bị đàn em của Phát lục túi. Mỗi khoản = phần trăm tiền mặt, kẹp giữa mức sàn và mức trần; không đủ tiền thì ví tự
 * lấy hết số đang có (`Wallet.spend`).
 */

export interface Penalty {
  /** Phần tiền mặt bị lấy (0..1). */
  readonly share: number;
  /** Ít nhất ngần này (đồng). */
  readonly min: number;
  /** Nhiều nhất ngần này (đồng). */
  readonly max: number;
}

export const BUSTED: Penalty = { share: 0.2, min: 150_000, max: 400_000 };
export const HOSPITAL: Penalty = { share: 0.1, min: 100_000, max: 250_000 };
export const SHAKEDOWN: Penalty = { share: 0.3, min: 50_000, max: 150_000 };

/** Số tiền của một khoản phạt khi đang có `cash` tiền mặt, làm tròn nghìn. */
export function penalty(p: Penalty, cash: number): number {
  const raw = Math.round((Math.max(0, cash) * p.share) / 1000) * 1000;
  return Math.min(p.max, Math.max(p.min, raw));
}
