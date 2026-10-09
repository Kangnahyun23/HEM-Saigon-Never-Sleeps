import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';

export interface Environment {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: SkyMesh;
  /** Gọi mỗi khung hình: kéo vùng đổ bóng theo điểm đang nhìn. */
  update(focus: THREE.Vector3): void;
}

function makeSky(sunDir: THREE.Vector3, clouds: boolean): SkyMesh {
  const sky = new SkyMesh();
  sky.turbidity.value = 6.5;
  sky.rayleigh.value = 1.6;
  sky.mieCoefficient.value = 0.006;
  sky.mieDirectionalG.value = 0.82;
  sky.cloudCoverage.value = clouds ? 0.45 : 0;
  sky.cloudDensity.value = 0.5;
  sky.sunPosition.value.copy(sunDir);
  return sky;
}

/** Nắng chiều Sài Gòn (~16 giờ): trời hơi mù, mây trắng, nắng vàng xiên. */
export async function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGPURenderer): Promise<Environment> {
  // Hướng nắng: cao 32°, từ phía tây-nam.
  const elevation = THREE.MathUtils.degToRad(32);
  const azimuth = THREE.MathUtils.degToRad(-130);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);

  const sky = makeSky(sunDir, true);
  sky.scale.setScalar(4000);
  scene.add(sky);

  // Ánh sáng môi trường (phản chiếu trên kính, bồn inox, mặt nước) lấy từ chính bầu trời.
  const envScene = new THREE.Scene();
  const envSky = makeSky(sunDir, false);
  envSky.scale.setScalar(50);
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = await pmrem.fromSceneAsync(envScene, 0.04, 0.1, 100);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.1;
  pmrem.dispose();

  scene.fog = new THREE.Fog('#d3d8da', 190, 760);

  const hemi = new THREE.HemisphereLight('#cfe0f5', '#8b7a63', 1.0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#ffe1b3', 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const range = 75;
  const cam = sun.shadow.camera;
  cam.left = -range;
  cam.right = range;
  cam.top = range;
  cam.bottom = -range;
  cam.near = 1;
  cam.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const texel = (range * 2) / 2048;
  const snapped = new THREE.Vector3();
  return {
    sun,
    hemi,
    sky,
    update(focus) {
      // Bám theo điểm nhìn, làm tròn theo kích thước texel để bóng không "rung".
      snapped.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(sunDir, 200);
      sun.target.updateMatrixWorld();
    },
  };
}
