import * as THREE from 'three/webgpu';
import { float, length, smoothstep, uv, vec3 } from 'three/tsl';
import { containsPoint } from '@/core/rect';
import { InstanceBatch } from '@/render/instancing';
import { nightUniform } from '../../nightGlow';
import { addMesh, GEO, type BuildContext } from './context';

const POOL_SIZE = 11;

/**
 * Vũng sáng vàng cam dưới mỗi đèn đường: tấm phẳng cộng sáng (additive), mờ dần ra mép, chỉ hiện khi tối.
 * Rẻ hơn hàng trăm PointLight thật — cả khu phố chỉ một draw call.
 */
export function buildLightPools(ctx: BuildContext): void {
  const { layout, pad } = ctx;
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const d = length(uv().sub(0.5)).mul(2);
  const falloff = float(1).sub(smoothstep(0.0, 1.0, d));
  mat.colorNode = vec3(1.0, 0.72, 0.4).mul(falloff.mul(falloff)).mul(nightUniform.mul(0.42));
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;

  const flat = GEO.plane.clone().rotateX(-Math.PI / 2);
  const pools = new InstanceBatch(flat, mat, { castShadow: false, receiveShadow: false, name: 'light-pools' });
  for (const lamp of ctx.lamps) {
    const onRoad = layout.roads.some((r) => containsPoint(r.rect, lamp.x, lamp.z));
    pools.add(lamp.x, (onRoad ? 0 : pad) + 0.03, lamp.z, POOL_SIZE, 1, POOL_SIZE);
  }
  const mesh = pools.build();
  if (mesh) mesh.renderOrder = 1;
  addMesh(ctx, mesh);
}
