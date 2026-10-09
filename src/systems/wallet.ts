/**
 * Ví của Tín: tiền mặt và khoản nợ app vay (thuần logic, có unit test). Đơn vị: đồng (số nguyên).
 */

export interface LedgerEntry {
  /** Giờ trong game lúc giao dịch (0–24). */
  hour: number;
  amount: number;
  reason: string;
}

export interface WalletData {
  cash: number;
  debt: number;
  ledger: LedgerEntry[];
}

/** Tên app cho vay của Phát "CEO" (hư cấu). */
export const LENDER = 'Vay Liền 5S';

export class Wallet {
  cash: number;
  debt: number;
  readonly ledger: LedgerEntry[] = [];

  constructor(data: Partial<WalletData> = {}) {
    this.cash = Math.round(data.cash ?? 150_000);
    this.debt = Math.round(data.debt ?? 30_000_000);
    if (data.ledger) this.ledger.push(...data.ledger.slice(-50));
  }

  /** Nhận tiền (kèo, thưởng). */
  earn(amount: number, reason: string, hour = 0): void {
    const a = Math.max(0, Math.round(amount));
    this.cash += a;
    this.log(hour, a, reason);
  }

  /** Mất / trả tiền; không đủ tiền thì trả hết số đang có. Trả về số tiền thực sự mất. */
  spend(amount: number, reason: string, hour = 0): number {
    const a = Math.min(this.cash, Math.max(0, Math.round(amount)));
    this.cash -= a;
    if (a > 0) this.log(hour, -a, reason);
    return a;
  }

  /** Trả nợ app vay; trả về số đã trả. */
  payDebt(amount: number, hour = 0): number {
    const a = Math.min(this.debt, this.cash, Math.max(0, Math.round(amount)));
    this.cash -= a;
    this.debt -= a;
    if (a > 0) this.log(hour, -a, `Trả nợ ${LENDER}`);
    return a;
  }

  private log(hour: number, amount: number, reason: string): void {
    this.ledger.push({ hour, amount, reason });
    if (this.ledger.length > 50) this.ledger.shift();
  }

  toJSON(): WalletData {
    return { cash: this.cash, debt: this.debt, ledger: [...this.ledger] };
  }
}

/** "1.250.000 đ" — dấu chấm phân cách hàng nghìn kiểu Việt Nam. */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  const digits = String(Math.abs(Math.round(amount)));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;
}
