/** Móc gỡ lỗi cho test e2e (Playwright) và console. Không dùng trong logic game. */
export interface DebugInfo {
  ready: boolean;
  backend: string;
  frames: number;
  physicsSteps: number;
  /** Dừng logic game theo thời gian thực (vẫn render); test e2e bật lên rồi tự chạy bằng `simulate` cho tất định. */
  paused: boolean;
  stats: Record<string, number>;
  /** Đặt camera tự do (dùng chụp ảnh kiểm tra). */
  setCamera(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __HEM__?: DebugInfo;
  }
}

export {};
