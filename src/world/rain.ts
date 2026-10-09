import * as THREE from 'three/webgpu';
import { attribute, float, mod, step, uniform, vec3, vec4 } from 'three/tsl';

const BOX = 56;
const HEIGHT = 28;
const SPEED = 17;
const LENGTH = 0.75;
const WIND_X = 0.12;
const WIND_Z = 0.05;

/**
 * Mưa rơi quanh camera: vài nghìn vệt mưa (LineSegments, 1 draw call). Vị trí tính hoàn toàn trên GPU
 * (TSL): hạt rơi theo thời gian và "quấn" quanh camera trong một khối 56 m, nên CPU không phải cập nhật gì.
 * Số hạt hiện ra tỉ lệ với cường độ mưa.
 */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private readonly time = uniform(0);
  private readonly cam = uniform(new THREE.Vector3());
  private readonly amount = uniform(0);

  constructor(count = 9000) {
    const pos = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    const seed = new Float32Array(count * 2);
    // Ngẫu nhiên tất định (không cần seed của game: chỉ là hoa văn hạt mưa).
    let s = 12345;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const x = rnd() * BOX;
      const y = rnd() * HEIGHT;
      const z = rnd() * BOX;
      const k = rnd();
      for (let v = 0; v < 2; v++) {
        pos.set([x, y, z], (i * 2 + v) * 3);
        end[i * 2 + v] = v;
        seed[i * 2 + v] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false });
    const base = attribute<'vec3'>('position', 'vec3');
    const tail = attribute<'float'>('aEnd', 'float');
    const k = attribute<'float'>('aSeed', 'float');
    const fall = this.time.mul(SPEED * 0.9).mul(k.mul(0.2).add(0.9));
    const y = mod(base.y.sub(fall), HEIGHT).add(this.cam.y).sub(HEIGHT * 0.45);
    const drift = fall.mul(WIND_X);
    const x = mod(base.x.add(drift).sub(this.cam.x), BOX).add(this.cam.x).sub(BOX / 2);
    const z = mod(base.z.add(fall.mul(WIND_Z)).sub(this.cam.z), BOX).add(this.cam.z).sub(BOX / 2);
    // Đầu kia của vệt: lùi ngược hướng rơi một đoạn.
    mat.positionNode = vec3(x, y, z).add(vec3(-WIND_X, 1, -WIND_Z).mul(tail.mul(LENGTH)));
    // Chỉ hiện một phần số hạt theo cường độ mưa.
    const visible = step(k, this.amount);
    mat.colorNode = vec4(0.75, 0.8, 0.88, float(0.38).mul(visible).mul(tail.mul(0.6).add(0.4)));

    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'rain';
    this.mesh.visible = false;
  }

  update(dt: number, camera: THREE.Vector3, rain: number): void {
    this.time.value += dt;
    this.cam.value.copy(camera);
    this.amount.value = rain;
    this.mesh.visible = rain > 0.01;
  }
}
