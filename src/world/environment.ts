import * as THREE from 'three/webgpu';
import { float, hash, mix, positionLocal, smoothstep, step, uniform, vec3 } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { addNightOnly, nightUniform, setNightLevel } from './nightGlow';
import type { Lighting, RGB } from './timeOfDay';

/** Ánh sáng đã áp thời tiết (sương, mây là tuỳ chọn). */
export type SceneLighting = Lighting & { fogNear?: number; fogFar?: number; cloud?: number };

export interface Environment {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: SkyMesh;
  /** Gọi mỗi khung hình: kéo vùng đổ bóng theo điểm đang nhìn. */
  update(focus: THREE.Vector3): void;
  /** Vẽ lại bản đồ bóng đổ sau mỗi `n` khung hình (1 = mọi khung hình; 2 khi máy yếu). */
  setShadowInterval(n: number): void;
  /** Áp ánh sáng theo giờ trong ngày (trời, nắng/trăng, sương, phơi sáng, đèn ban đêm). */
  setLighting(l: SceneLighting): void;
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

  // Vòm trời đêm: SkyMesh gần như đen khi mặt trời lặn, nên phủ thêm một vòm xanh thẫm có quầng cam tím của
  // thành phố ở chân trời và vài ngôi sao; độ đậm theo mức đêm.
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
  const up = positionLocal.y.div(2000); // độ cao trên vòm: 0 ở chân trời, 1 ở đỉnh
  const glow = smoothstep(0.25, 0.0, up);
  const nightSky = mix(vec3(0.015, 0.022, 0.055), vec3(0.1, 0.065, 0.1), glow);
  const starCell = positionLocal.mul(0.45).floor();
  const domeCloud = uniform(0);
  const star = float(1).sub(domeCloud).mul(step(0.9985, hash(starCell.x.add(starCell.y.mul(157)).add(starCell.z.mul(311))))).mul(smoothstep(0.15, 0.4, up));
  domeMat.colorNode = nightSky.add(vec3(star.mul(0.9)));
  domeMat.opacityNode = nightUniform.mul(float(0.96));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), domeMat);
  dome.name = 'night-dome';
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  addNightOnly(dome);

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
  let shadowInterval = 1;
  let frame = 0;
  const snapped = new THREE.Vector3();
  const lightDir = sunDir.clone();
  const fog = scene.fog;
  const setColor = (c: THREE.Color, rgb: RGB): void => {
    c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  };
  return {
    sun,
    hemi,
    sky,
    update(focus) {
      frame++;
      if (shadowInterval > 1) {
        // Khung không vẽ lại bóng: giữ nguyên camera bóng cho khớp bản đồ bóng cũ (dời đi là bóng lệch / nhảy).
        if (frame % shadowInterval !== 0) return;
        sun.shadow.needsUpdate = true;
      }
      // Bám theo điểm nhìn, làm tròn theo kích thước texel để bóng không "rung".
      snapped.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(lightDir, 200);
      sun.target.updateMatrixWorld();
    },
    setShadowInterval(n) {
      shadowInterval = Math.max(1, Math.round(n));
      sun.shadow.autoUpdate = shadowInterval === 1;
      sun.shadow.needsUpdate = true;
    },
    setLighting(l) {
      sky.sunPosition.value.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]);
      lightDir.set(l.lightDir[0], l.lightDir[1], l.lightDir[2]);
      setColor(sun.color, l.lightColor);
      sun.intensity = l.lightIntensity;
      setColor(hemi.color, l.hemiSky);
      setColor(hemi.groundColor, l.hemiGround);
      hemi.intensity = l.hemiIntensity;
      setColor(fog.color, l.fogColor);
      if (fog instanceof THREE.Fog) {
        fog.near = l.fogNear ?? 190;
        fog.far = l.fogFar ?? 760;
      }
      const cloud = l.cloud ?? 0;
      sky.cloudCoverage.value = 0.45 + 0.5 * cloud;
      sky.turbidity.value = 6.5 + 8 * cloud;
      domeCloud.value = cloud;
      scene.environmentIntensity = l.envIntensity;
      renderer.toneMappingExposure = l.exposure;
      setNightLevel(l.night);
    },
  };
}
