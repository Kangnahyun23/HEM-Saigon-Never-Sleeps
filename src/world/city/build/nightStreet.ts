import * as THREE from 'three/webgpu';
import { InstanceBatch } from '@/render/instancing';
import { addNightOnly } from '../../nightGlow';
import { createShopSpillMaterial, createWetStreakMaterial } from '../nightMaterials';
import { addMesh, GEO, localToWorld, type BuildContext } from './context';

/** Vũng đèn tiệm phủ ra vỉa hè tối đa (m). */
const SPILL_DEPTH = 3.2;

/**
 * Phố đêm: ánh đèn tiệm còn mở hắt ra vỉa hè, và bảng hiệu sáng (hộp đèn, neon, alu) phản chiếu thành vệt màu
 * trên mặt đường ướt sau mưa. Cả hai là tấm phẳng cộng sáng, chỉ vẽ lúc tối — mỗi loại một lệnh vẽ cho cả phố.
 */
export function buildNightStreet(ctx: BuildContext): void {
  const { pad } = ctx;
  // Tấm phẳng nằm ngang: uv.v = 1 ở mép phía −Z cục bộ (sát mặt tiền khi tâm đặt ra phía +Z).
  const flat = GEO.plane.clone().rotateX(-Math.PI / 2);
  const spills = new InstanceBatch(flat, createShopSpillMaterial(), { castShadow: false, receiveShadow: false, name: 'shop-spill', attributes: { aSeed: 1 } });
  const streaks = new InstanceBatch(flat, createWetStreakMaterial(), { castShadow: false, receiveShadow: false, name: 'wet-streaks', attributes: { aTint: 4, aWidth: 1, aCenter: 3 } });
  const tint = new THREE.Color();

  for (const s of ctx.shopFronts) {
    const depth = Math.min(SPILL_DEPTH, s.sidewalk - 0.3);
    if (depth > 0.8) {
      const [x, z] = localToWorld(s.x, s.z, s.yaw, 0, depth / 2);
      spills.add(x, pad + 0.025, z, s.width * 0.96, 1, depth, s.yaw, undefined, { aSeed: s.seed });
    }
    if (s.sign) {
      tint.set(s.sign.color);
      // Điểm đầu vệt: mép đường ngay dưới bảng hiệu; vertex shader kéo vệt về phía camera.
      const [x, z] = localToWorld(s.x, s.z, s.yaw, 0, s.sidewalk + 0.2);
      const w = Math.min(1.0, Math.min(s.sign.width, s.width) * 0.25);
      streaks.add(x, 0.028, z, 1, 1, 1, 0, undefined, { aTint: [tint.r, tint.g, tint.b, s.sign.glow], aWidth: w, aCenter: [x, 0.028, z] });
    }
  }

  for (const batch of [spills, streaks]) {
    const mesh = batch.build();
    if (!mesh) continue;
    mesh.renderOrder = 1;
    // Vệt phản chiếu dựng hình trong shader (vươn xa khỏi điểm đặt) ⇒ không dùng khối bao để loại.
    if (batch === streaks) mesh.frustumCulled = false;
    addNightOnly(mesh);
    addMesh(ctx, mesh);
  }
}
