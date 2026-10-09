/** Móc gỡ lỗi cho test e2e (Playwright) và console. Không dùng trong logic game. */
export interface DebugInfo {
  ready: boolean;
  backend: string;
  frames: number;
  physicsSteps: number;
  crateHeights: () => number[];
}

declare global {
  interface Window {
    __HEM__?: DebugInfo;
  }
}

export {};
