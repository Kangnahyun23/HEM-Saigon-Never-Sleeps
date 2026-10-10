import * as THREE from 'three/webgpu';
import { pass, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { bloomStrength } from '@/world/timeOfDay';

/** Chỉ phần rất sáng (neon, LED, hộp đèn, đèn xe, đèn đường) mới loé — ngưỡng theo độ sáng HDR trước tone mapping. */
const THRESHOLD = 1.0;
const RADIUS = 0.45;

/**
 * Bloom ban đêm (hậu kỳ): vẽ cảnh vào ảnh HDR rồi cộng quầng sáng mờ quanh chỗ rất sáng.
 * Ban ngày / mức Thấp không chạy lượt hậu kỳ nào — vẽ thẳng như cũ (bloomStrength = 0 ⇒ `render()` trả false).
 * `scale` = độ phân giải ảnh bloom so với màn hình (0 = tắt): Vừa 0,35, Cao 0,5.
 */
export class NightBloom {
  private readonly pipeline: THREE.RenderPipeline;
  private readonly strength = uniform(0);
  private readonly node: ReturnType<typeof bloom>;
  private scale = 0;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    this.node = bloom(color, this.strength, RADIUS, THRESHOLD);
    this.pipeline.outputNode = color.add(this.node);
  }

  setScale(scale: number): void {
    this.scale = scale;
    if (scale > 0) this.node.setResolutionScale(scale);
  }

  get active(): boolean {
    return this.scale > 0;
  }

  /** Vẽ khung hình qua bloom nếu đang bật và trời đủ tối; trả false để nơi gọi tự vẽ thẳng. */
  render(night: number): boolean {
    const s = this.scale > 0 ? bloomStrength(night) : 0;
    if (s <= 0) return false;
    this.strength.value = s;
    this.pipeline.render();
    return true;
  }
}
