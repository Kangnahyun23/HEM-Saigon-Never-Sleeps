import type { Backend } from '@/render/renderer';

/** HUD tạm cho M0: tên game, FPS, backend render và phím điều khiển. */
export class Hud {
  private readonly fpsEl: HTMLElement;
  private frames = 0;
  private elapsed = 0;

  constructor(root: HTMLElement, backend: Backend) {
    root.innerHTML = `
      <h1>HẺM</h1>
      <div class="quiet">Sài Gòn Không Ngủ · sandbox M0</div>
      <div>Render: <strong>${backend}</strong> · <span data-fps>– fps</span></div>
      <div class="quiet">Chuột: xoay/zoom camera · <kbd>Space</kbd> thả thùng · <kbd>R</kbd> làm lại</div>`;
    this.fpsEl = root.querySelector('[data-fps]') as HTMLElement;
  }

  update(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.elapsed)} fps`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}
