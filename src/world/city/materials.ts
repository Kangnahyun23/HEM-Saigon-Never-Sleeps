import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  float,
  floor,
  fract,
  hash,
  max,
  mix,
  positionWorld,
  select,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { nightUniform, wetUniform } from '../nightGlow';
import { FLOOR_HEIGHT } from './layout';

/**
 * Vật liệu mặt tiền nhà ống, vẽ hoàn toàn bằng shader (TSL) nên MỘT InstancedMesh vẽ được cả nghìn căn nhà khác nhau:
 * - aSize  (vec3): kích thước căn nhà (m) để tính toạ độ trên từng mặt tường
 * - aColor (vec3): màu sơn tường
 * - aInfo  (vec4): x = hướng mặt tiền (0:+x 1:-x 2:+z 3:-z), y = seed 0..1, z = loại (0 nhà, 1 nhà phố, 2 cao ốc),
 *                  w = vị trí (0 mặt tiền đường, 1 trong hẻm, 2 phông nền xa)
 * Mặt tiền: cửa sổ/cửa ban công từng tầng, tầng trệt là cửa hàng (mở cửa hoặc kéo cửa cuốn).
 * Mặt sau: cửa sổ nhỏ. Hai bên hông: tường trống loang ố. Mái: bê tông.
 */
export function createFacadeMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial();

  const size = attribute<'vec3'>('aSize', 'vec3');
  const wall = attribute<'vec3'>('aColor', 'vec3');
  const info = attribute<'vec4'>('aInfo', 'vec4');
  const p = attribute<'vec3'>('position', 'vec3');
  const n = attribute<'vec3'>('normal', 'vec3');

  const local = p.add(0.5).mul(size); // mét tính từ góc nhỏ nhất của căn nhà
  const zFace = abs(n.z).greaterThan(0.5);
  const roof = n.y.greaterThan(0.5);
  const u = select(zFace, local.x, local.z);
  const faceW = select(zFace, size.x, size.z);
  const y = local.y;

  const faceCode = select(n.x.greaterThan(0.5), float(0), select(n.x.lessThan(-0.5), float(1), select(n.z.greaterThan(0.5), float(2), float(3))));
  const frontCode = info.x;
  const backCode = select(fract(frontCode.mul(0.5)).lessThan(0.25), frontCode.add(1), frontCode.sub(1));
  const isFront = abs(faceCode.sub(frontCode)).lessThan(0.5);
  const isBack = abs(faceCode.sub(backCode)).lessThan(0.5);
  const seed = info.y;
  const isTower = info.z.greaterThan(1.5);

  const floorIdx = floor(y.div(FLOOR_HEIGHT));
  const fv = fract(y.div(FLOOR_HEIGHT));
  const belowParapet = y.lessThan(size.y.sub(0.75));
  const upper = floorIdx.greaterThan(0.5);

  // --- Cửa sổ ---------------------------------------------------------------------------------------------
  // Nhà ống: mặt tiền mỗi tầng 1–2 ô cửa lớn ra ban công; cao ốc: lưới kính dày; mặt sau: 1 ô nhỏ.
  const colW = select(isTower, float(1.6), select(faceW.greaterThan(6.5), faceW.div(3), select(faceW.greaterThan(4.6), faceW.div(2), faceW)));
  const cols = max(float(1), floor(faceW.div(colW)));
  const cell = faceW.div(cols);
  const cu = fract(u.div(cell));
  const col = floor(u.div(cell));

  const frontWinX = select(isTower, cu.greaterThan(0.06).and(cu.lessThan(0.94)), cu.greaterThan(0.14).and(cu.lessThan(0.86)));
  const frontWinY = select(isTower, fv.greaterThan(0.12).and(fv.lessThan(0.92)), fv.greaterThan(0.06).and(fv.lessThan(0.8)));
  const backWinX = cu.greaterThan(0.36).and(cu.lessThan(0.64));
  const backWinY = fv.greaterThan(0.38).and(fv.lessThan(0.72));

  const winFront = isFront.and(frontWinX).and(frontWinY).and(upper).and(belowParapet);
  const winBack = isBack.and(backWinX).and(backWinY).and(upper).and(belowParapet);
  const winTowerSide = isTower.and(isFront.not()).and(isBack.not()).and(frontWinX).and(frontWinY).and(upper).and(belowParapet);
  const isWindow = winFront.or(winBack).or(winTowerSide);

  // Khung nhôm: viền mỏng bao quanh ô kính.
  const fx = select(isFront.or(isTower), select(isTower, abs(cu.sub(0.5)).greaterThan(0.42), abs(cu.sub(0.5)).greaterThan(0.33)), abs(cu.sub(0.5)).greaterThan(0.12));
  const fy = select(isFront.or(isTower), select(isTower, abs(fv.sub(0.52)).greaterThan(0.37), abs(fv.sub(0.43)).greaterThan(0.33)), abs(fv.sub(0.55)).greaterThan(0.14));
  const isFrame = isWindow.and(fx.or(fy));
  // Song sắt chia ô (đặc trưng nhà phố): vạch dọc mảnh.
  const bars = isWindow.and(isTower.not()).and(fract(cu.mul(9)).lessThan(0.06));

  // Kính: phản chiếu trời giả bằng gradient theo chiều cao ô + rèm màu ở một số ô.
  const winHash = hash(col.add(floorIdx.mul(17)).add(seed.mul(9973)).add(faceCode.mul(131)));
  const glassDark = vec3(0.07, 0.1, 0.13);
  const glassSky = select(isTower, vec3(0.42, 0.58, 0.72), vec3(0.32, 0.4, 0.48));
  const glass = mix(glassDark, glassSky, smoothstep(0.1, 0.95, fv).mul(0.8));
  const curtainPalette = mix(vec3(0.85, 0.72, 0.45), vec3(0.62, 0.78, 0.82), hash(winHash.mul(7.3)));
  const glassColor = select(winHash.greaterThan(0.72).and(isTower.not()), curtainPalette.mul(0.75), glass);
  const frameColor = select(winHash.greaterThan(0.5), vec3(0.88, 0.88, 0.86), vec3(0.18, 0.2, 0.22));

  // --- Tầng trệt mặt tiền -----------------------------------------------------------------------------------
  // Nhà mặt đường: cửa hàng (mở cửa thấy bên trong, hoặc kéo cửa cuốn).
  // Nhà trong hẻm: cửa sắt xếp sơn màu (đóng/mở), bên trong là phòng khách.
  const inHem = info.w.greaterThan(0.5);
  const shopU = u.div(faceW);
  const isShop = isFront.and(isTower.not()).and(floorIdx.lessThan(0.5)).and(shopU.greaterThan(0.05)).and(shopU.lessThan(0.95)).and(fv.lessThan(0.84));
  const closedChance = select(inHem, float(0.4), float(0.25));
  const shutterClosed = hash(seed.mul(4567)).lessThan(closedChance);
  const shutter = vec3(0.6, 0.61, 0.63).mul(float(0.82).add(select(fract(y.mul(7)).lessThan(0.5), float(0.12), float(0))));
  const gatePaint = mix(vec3(0.2, 0.42, 0.33), vec3(0.22, 0.33, 0.52), hash(seed.mul(911)));
  // Cửa sắt xếp: nan dọc dày (mỗi ~12 cm) + hai thanh ngang.
  const slat = fract(u.mul(8)).lessThan(0.5);
  const rail = abs(fv.sub(0.08)).lessThan(0.015).or(abs(fv.sub(0.76)).lessThan(0.015));
  const gate = select(rail, gatePaint.mul(0.7), select(slat, gatePaint, gatePaint.mul(0.78)));
  const interiorDepth = smoothstep(0.0, 0.84, fv);
  const warm = mix(vec3(0.62, 0.46, 0.3), vec3(0.75, 0.62, 0.48), hash(seed.mul(77)));
  const interior = mix(warm, warm.mul(0.45), interiorDepth);
  const shopColor = select(shutterClosed, select(inHem, gate, shutter), interior);
  // Lanh tô / bảng hiệu nền phía trên cửa hàng.
  const isLintel = isFront.and(isTower.not()).and(floorIdx.lessThan(0.5)).and(fv.greaterThanEqual(0.84));
  const lintel = wall.mul(0.78);
  // Tầng trệt cao ốc: sảnh kính.
  const isLobby = isTower.and(floorIdx.lessThan(0.5)).and(fv.lessThan(0.9));

  // --- Tường ------------------------------------------------------------------------------------------------
  // Loang ố: sọc dọc theo nước mưa + chân tường sẫm; tường hông sẫm hơn chút.
  const streak = hash(floor(u.mul(1.3)).add(seed.mul(331))).mul(0.12);
  const footDarken = smoothstep(0.0, 1.4, y).mul(0.12).add(0.88);
  const sideShade = select(isFront.or(isBack), float(1), float(0.9));
  const floorBand = select(isFront.and(fv.lessThan(0.045)).and(upper), float(0.82), float(1)); // gờ sàn mỗi tầng
  const wallColor = wall.mul(float(0.94).sub(streak)).mul(footDarken).mul(sideShade).mul(floorBand);
  const towerWall = mix(wall, vec3(0.8, 0.82, 0.84), 0.6);

  const roofColor = vec3(0.47, 0.45, 0.42).mul(float(0.85).add(hash(floor(positionWorld.x.mul(0.5)).add(floor(positionWorld.z.mul(0.5)).mul(57))).mul(0.15)));

  const base = select(isTower, towerWall, wallColor);
  const withShop = select(isShop, shopColor, select(isLintel, lintel, base));
  const withLobby = select(isLobby, mix(glassDark, glassSky, fv.mul(0.6)), withShop);
  const withWindows = select(isFrame.or(bars), frameColor, select(isWindow, glassColor, withLobby));
  mat.colorNode = select(roof, roofColor, withWindows);

  const glassy = isWindow.and(isFrame.not()).or(isLobby);
  const metalShutter = isShop.and(shutterClosed).and(inHem.not());
  mat.roughnessNode = select(glassy, float(0.12), select(metalShutter, float(0.5), float(0.9)));
  mat.metalnessNode = select(glassy, float(0.3), select(metalShutter, float(0.45), float(0)));

  // --- Ban đêm: đèn trong nhà hắt ra cửa sổ, cửa hàng còn mở sáng trưng -----------------------------------------
  // Khoảng 45 % ô cửa sáng đèn; nửa đèn vàng ấm, nửa đèn tuýp trắng xanh (rất "Sài Gòn"). Ô có rèm sáng màu rèm.
  const litHash = hash(winHash.mul(13.7).add(3.1));
  const lit = isWindow.and(isFrame.not()).and(bars.not()).and(litHash.lessThan(0.45));
  const lampTone = mix(vec3(1.0, 0.78, 0.48), vec3(0.78, 0.9, 1.0), select(hash(winHash.mul(5.3)).greaterThan(0.5), float(1), float(0)));
  const windowGlow = select(winHash.greaterThan(0.72).and(isTower.not()), curtainPalette.mul(0.6), lampTone.mul(mix(float(0.45), float(0.85), litHash.mul(2.2))));
  const shopGlow = select(isShop.and(shutterClosed.not()), mix(vec3(1.0, 0.82, 0.55), vec3(0.85, 0.95, 1.0), hash(seed.mul(53))).mul(float(1.0).sub(interiorDepth.mul(0.6))), vec3(0, 0, 0));
  const lobbyGlow = select(isLobby, vec3(0.9, 0.85, 0.7).mul(0.7), vec3(0, 0, 0));
  const glow = select(roof, vec3(0, 0, 0), select(lit, windowGlow, shopGlow.add(lobbyGlow)));
  mat.emissiveNode = glow.mul(nightUniform);
  return mat;
}

/** Mặt vỉa hè / nền block: gạch lát ô 0.5 m, có mạch vữa. */
export function createPavementMaterial(base: THREE.ColorRepresentation): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
  const c = new THREE.Color(base);
  const tile = vec2(positionWorld.x, positionWorld.z).div(0.5);
  const grout = fract(tile.x).lessThan(0.05).or(fract(tile.y).lessThan(0.05));
  const tileHash = hash(floor(tile.x).add(floor(tile.y).mul(113)));
  const color = vec3(c.r, c.g, c.b).mul(float(0.9).add(tileHash.mul(0.12)));
  // Ướt mưa: sẫm lại và bóng lên.
  mat.colorNode = select(grout, color.mul(0.72), color).mul(mix(float(1), float(0.72), wetUniform));
  mat.roughnessNode = mix(float(0.92), float(0.45), wetUniform);
  return mat;
}

/** Bê tông hẻm: tấm đổ 2.5 m có khe co giãn, loang ố, vá chỗ đậm chỗ nhạt. */
export function createConcreteMaterial(base: THREE.ColorRepresentation): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  const c = new THREE.Color(base);
  const slab = vec2(positionWorld.x, positionWorld.z).div(2.5);
  const joint = fract(slab.x).lessThan(0.012).or(fract(slab.y).lessThan(0.012));
  const slabHash = hash(floor(slab.x).add(floor(slab.y).mul(97)));
  const grain = hash(floor(positionWorld.x.mul(4)).add(floor(positionWorld.z.mul(4)).mul(733)));
  const color = vec3(c.r, c.g, c.b).mul(float(0.84).add(slabHash.mul(0.18)).add(grain.mul(0.06)));
  mat.colorNode = select(joint, color.mul(0.6), color);
  return mat;
}

/** Mặt đường nhựa: hạt lấm tấm và vệt bánh xe sẫm hơn. */
export function createAsphaltMaterial(base: THREE.ColorRepresentation): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.96 });
  const c = new THREE.Color(base);
  const grain = hash(floor(positionWorld.x.mul(3)).add(floor(positionWorld.z.mul(3)).mul(1337)));
  const patch = hash(floor(positionWorld.x.div(7)).add(floor(positionWorld.z.div(7)).mul(71)));
  // Ướt mưa: nhựa đường sẫm, gần như gương (phản chiếu đèn đường, đèn xe qua môi trường); vũng nước theo mảng.
  const puddle = smoothstep(0.55, 0.85, patch).mul(wetUniform);
  mat.colorNode = vec3(c.r, c.g, c.b).mul(float(0.88).add(grain.mul(0.1)).add(patch.mul(0.08))).mul(mix(float(1), float(0.55), wetUniform));
  mat.roughnessNode = mix(float(0.96), float(0.32), wetUniform).sub(puddle.mul(0.25));
  mat.metalnessNode = puddle.mul(0.25);
  return mat;
}

/** Bảng hiệu: lấy một ô trong atlas chữ (aSign = góc ô, đơn vị uv). */
export function createSignMaterial(atlas: THREE.Texture, cols: number, rows: number): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
  const offset = attribute<'vec2'>('aSign', 'vec2');
  const st = uv().mul(vec2(1 / cols, 1 / rows)).add(offset);
  mat.colorNode = texture(atlas, st).rgb;
  // Bảng hiệu có đèn: ban đêm tự phát sáng theo màu chữ/nền.
  mat.emissiveNode = texture(atlas, st).rgb.mul(nightUniform.mul(0.75));
  return mat;
}
