import * as THREE from 'three/webgpu';
import { float, sin, smoothstep, time, uv, vec3 } from 'three/tsl';

/**
 * Điểm đánh dấu nhiệm vụ: cột sáng vàng dựng đứng + vòng sáng dưới đất, nhấp nháy nhẹ. Thấy được từ xa qua mái nhà.
 */
export class MissionMarker {
  readonly root = new THREE.Group();

  constructor(color = '#ffd23f') {
    const c = new THREE.Color(color);
    const pulse = sin(time.mul(3)).mul(0.15).add(0.85);

    const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    // Cột sáng mờ dần lên trên.
    beamMat.colorNode = vec3(c.r, c.g, c.b).mul(float(1).sub(uv().y).pow(1.6)).mul(pulse.mul(0.55));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 24, 1, true), beamMat);
    beam.position.y = 20;
    beam.renderOrder = 3;

    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const d = uv().sub(0.5).length().mul(2);
    ringMat.colorNode = vec3(c.r, c.g, c.b).mul(smoothstep(0.62, 0.8, d).mul(smoothstep(1.0, 0.86, d))).mul(pulse.mul(1.6));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.2;
    ring.renderOrder = 3;

    this.root.add(beam, ring);
    this.root.visible = false;
    this.root.name = 'mission-marker';
  }

  show(x: number, z: number): void {
    this.root.position.set(x, 0, z);
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }
}
