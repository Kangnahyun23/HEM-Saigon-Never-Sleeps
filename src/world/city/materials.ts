import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cameraViewMatrix,
  float,
  floor,
  fract,
  fwidth,
  hash,
  max,
  mix,
  normalView,
  normalWorld,
  positionWorld,
  select,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { TextureId } from '@/assets/manifest';
import { getTextures } from '@/assets/textures';
import { closedUniform, nightUniform, wetUniform } from '../nightGlow';
import { FLOOR_HEIGHT } from './layout';

/**
 * Mức "quá dày để thấy" của hoa văn lặp chu kỳ `period` (m) theo toạ độ `coord`: 0 khi mỗi chu kỳ chiếm ≥ ~4 điểm ảnh,
 * 1 khi dưới ~1,5 điểm ảnh (nhìn xa / nhìn xiên). Dùng để hoà nan cửa, song sắt về màu trung bình thay vì nhiễu răng cưa.
 */
function patternFade(coord: THREE.Node<'float'>, period: number) {
  return smoothstep(0.25, 0.65, fwidth(coord).div(period));
}

/**
 * Texture lặp CC0 (public/media, xem CREDITS.md) chiếu từ trên xuống theo toạ độ thế giới cho mặt đất.
 * Màu: giữ tông `base` của game, chỉ lấy chi tiết từ ảnh (ảnh / màu trung bình của ảnh), `strength` 0..1 là độ đậm chi tiết.
 * Normal: chỉ cho mặt hướng lên (thành vỉa hè giữ normal hình học). Chưa tải được ảnh ⇒ null (dùng cách vẽ thủ tục).
 */
function groundTexture(id: TextureId, base: THREE.Color, strength: number) {
  const set = getTextures(id);
  const mean = set?.entry.mean;
  if (!set?.color || !mean) return null;
  const [sw, sh] = set.entry.size;
  // v ngược chiều z ⇒ tiếp tuyến +X, song tiếp tuyến −Z, pháp tuyến +Y (tam diện thuận).
  const st = vec2(positionWorld.x.div(sw), positionWorld.z.div(sh).negate());
  const detail = texture(set.color, st).rgb.div(vec3(mean[0], mean[1], mean[2]));
  const color = vec3(base.r, base.g, base.b).mul(mix(vec3(1, 1, 1), detail, strength));
  let normal = null;
  if (set.normal) {
    const t = texture(set.normal, st).xyz.mul(2).sub(1);
    const world = vec3(t.x, t.z, t.y.negate()).normalize();
    normal = select(normalWorld.y.greaterThan(0.5), cameraViewMatrix.mul(vec4(world, 0)).xyz.normalize(), normalView);
  }
  return { color, normal };
}

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
  // Thuộc tính instance tới fragment qua nội suy nên số nguyên có thể thành 0,9999… ⇒ không fract() đúng tại số nguyên.
  const backCode = select(fract(frontCode.mul(0.5).add(0.25)).lessThan(0.5), frontCode.add(1), frontCode.sub(1));
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
  const bars = isWindow.and(isTower.not()).and(fract(cu.mul(9)).lessThan(0.06)).and(patternFade(u, 0.5).lessThan(0.5));

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
  // Nhà trong hẻm (w = 1 cửa trái, 1,5 cửa phải; phông nền xa w = 2 giữ kiểu cũ): một ô cửa ra vào + một cửa sổ song sắt,
  // phần còn lại là tường — thay cho cửa sắt kéo kín cả bề ngang trông như vách container. Khớp hemDoorSpan() bên JS.
  const hemHouse = inHem.and(info.w.lessThan(1.75));
  const doorRight = info.w.greaterThan(1.25);
  const doorW = faceW.mul(0.5).min(2.4);
  const doorA = select(doorRight, faceW.sub(0.15).sub(doorW), float(0.15));
  const inDoor = u.greaterThan(doorA).and(u.lessThan(doorA.add(doorW)));
  const hemWinW = faceW.mul(0.3).min(1.4);
  const hemWinA = select(doorRight, float(0.35), faceW.sub(0.35).sub(hemWinW));
  const groundFront = isFront.and(isTower.not()).and(floorIdx.lessThan(0.5));
  const isHemWindow = hemHouse.and(groundFront).and(u.greaterThan(hemWinA)).and(u.lessThan(hemWinA.add(hemWinW))).and(fv.greaterThan(0.32)).and(fv.lessThan(0.72));
  const shopU = u.div(faceW);
  const openingSpan = select(hemHouse, inDoor, shopU.greaterThan(0.05).and(shopU.lessThan(0.95)));
  const isShop = groundFront.and(openingSpan).and(fv.lessThan(0.84));
  // Tỉ lệ tiệm kéo cửa theo giờ (closedUniform: ban ngày ít, khuya hầu hết); nhà trong hẻm đóng cửa nhiều hơn.
  const closedChance = select(inHem, closedUniform.add(0.25).min(0.97), closedUniform);
  const shutterClosed = hash(seed.mul(4567)).lessThan(closedChance);
  const shutter = vec3(0.6, 0.61, 0.63).mul(float(0.82).add(mix(select(fract(y.mul(7)).lessThan(0.5), float(0.12), float(0)), float(0.06), patternFade(y, 1 / 7))));
  const gatePaint = mix(vec3(0.2, 0.42, 0.33), vec3(0.22, 0.33, 0.52), hash(seed.mul(911)));
  // Cửa sắt xếp: nan dọc dày (mỗi ~12 cm) + hai thanh ngang.
  const slat = fract(u.mul(8)).lessThan(0.5);
  const rail = abs(fv.sub(0.08)).lessThan(0.015).or(abs(fv.sub(0.76)).lessThan(0.015));
  // Cửa xếp: thêm song chéo hình thoi đặc trưng.
  const lattice = abs(fract(u.add(y).mul(2.2)).sub(0.5)).lessThan(0.045).or(abs(fract(u.sub(y).mul(2.2)).sub(0.5)).lessThan(0.045));
  const gateSharp = select(rail.or(lattice), gatePaint.mul(0.7), select(slat, gatePaint, gatePaint.mul(0.78)));
  const gate = mix(gateSharp, gatePaint.mul(0.8), patternFade(u, 0.125));
  // Nội thất giả (interior mapping): dò tia nhìn vào một căn phòng hộp sau ô cửa — tường sau, hai tường bên, sàn, trần —
  // nên nhìn xiên vẫn thấy chiều sâu, kệ hàng, đèn tuýp mà không cần thêm hình khối nào.
  const view = positionWorld.sub(cameraPosition).normalize();
  const nW = n; // mặt tiền thẳng trục thế giới (InstanceBatch không xoay nhà) ⇒ pháp tuyến cục bộ = thế giới
  const du = select(zFace, view.x, view.z);
  const dd = view.dot(nW).negate().max(0.001); // đi sâu vào trong
  const dy = view.y;
  const uMin = select(hemHouse, doorA, faceW.mul(0.05));
  const uMax = select(hemHouse, doorA.add(doorW), faceW.mul(0.95));
  const yTop = float(FLOOR_HEIGHT * 0.84);
  const roomD = select(zFace, size.z, size.x).mul(0.5).min(4.5);
  const tBack = roomD.div(dd);
  const tSide = select(du.greaterThan(0), uMax.sub(u), uMin.sub(u)).div(select(abs(du).lessThan(0.0001), float(0.0001), du));
  const tY = select(dy.greaterThan(0), yTop.sub(y), y.negate()).div(select(abs(dy).lessThan(0.0001), float(0.0001), dy));
  const t = tBack.min(tSide).min(tY);
  const hu = u.add(du.mul(t));
  const hy = y.add(dy.mul(t));
  const hd = dd.mul(t);
  const hitBack = tBack.lessThanEqual(tSide).and(tBack.lessThanEqual(tY));
  const hitSide = hitBack.not().and(tSide.lessThanEqual(tY));
  const hitFloor = hitBack.not().and(hitSide.not()).and(dy.lessThan(0));
  // Tường: kem / xanh nhạt; kệ hàng (tiệm tạp hoá, điện thoại, quần áo…) khoảng 2/3 số tiệm mặt đường.
  const roomWall = mix(vec3(0.78, 0.72, 0.6), vec3(0.62, 0.7, 0.72), hash(seed.mul(77)));
  const shelves = inHem.not().and(hash(seed.mul(3.7)).lessThan(0.66));
  const along = select(hitBack, hu, hd); // toạ độ ngang trên mặt tường đang nhìn
  const band = fract(hy.div(0.42));
  const inShelfZone = hy.greaterThan(0.25).and(hy.lessThan(2.15));
  const board = inShelfZone.and(band.lessThan(0.07));
  const goodsHash = hash(floor(along.mul(5)).add(floor(hy.div(0.42)).mul(13)).add(seed.mul(57)));
  const goods = inShelfZone.and(band.greaterThan(0.1)).and(band.lessThan(0.8)).and(goodsHash.greaterThan(0.22));
  // Hàng hoá: bảng màu bao bì đậm (đỏ, vàng, xanh dương, xanh lá, cam, trắng).
  const gk = hash(goodsHash.mul(7.1));
  const goodsColor = select(
    gk.lessThan(0.2),
    vec3(0.75, 0.08, 0.06),
    select(gk.lessThan(0.38), vec3(0.95, 0.72, 0.05), select(gk.lessThan(0.55), vec3(0.06, 0.3, 0.75), select(gk.lessThan(0.7), vec3(0.1, 0.55, 0.2), select(gk.lessThan(0.85), vec3(0.95, 0.42, 0.06), vec3(0.92, 0.92, 0.9))))),
  );
  const wallHit = select(shelves.and(board), vec3(0.35, 0.3, 0.26), select(shelves.and(goods), goodsColor, roomWall));
  // Nhà trong hẻm: bàn thờ đỏ trên tường sau.
  const altar = inHem.and(hitBack).and(abs(hu.sub(faceW.mul(0.5))).lessThan(0.35)).and(hy.greaterThan(1.5)).and(hy.lessThan(1.95));
  const tileU = fract(hu.div(0.4)).lessThan(0.5);
  const tileD = fract(hd.div(0.4)).lessThan(0.5);
  const floorTile = select(tileU.and(tileD).or(tileU.not().and(tileD.not())), vec3(0.82, 0.8, 0.76), vec3(0.68, 0.66, 0.62));
  // Trần: đèn tuýp mỗi 1,6 m theo chiều sâu.
  const tube = fract(hd.div(1.6)).greaterThan(0.45).and(fract(hd.div(1.6)).lessThan(0.53)).and(abs(hu.sub(faceW.mul(0.5))).lessThan(faceW.mul(0.22)));
  const ceiling = select(tube, vec3(1, 1, 0.98), vec3(0.7, 0.7, 0.68));
  const roomDetail = select(hitFloor, floorTile, select(hitBack.or(hitSide), select(altar, vec3(0.75, 0.08, 0.06), wallHit), ceiling));
  // Chống răng cưa: nhìn xiên (hẻm hẹp) toạ độ trong phòng giãn rất nhanh giữa hai điểm ảnh ⇒ hoa văn (gạch, kệ, đèn tuýp)
  // thành nhiễu lấm tấm. Giãn càng nhiều càng hoà về màu trung bình của phòng.
  const stretch = fwidth(hu).add(fwidth(hd)).add(fwidth(hy));
  const roomColor = mix(roomDetail, roomWall.mul(0.85), smoothstep(0.08, 0.35, stretch));
  // Càng sâu càng tối (ánh sáng ngoài phố không chiếu tới).
  const depthShade = mix(float(0.55), float(0.22), hd.div(roomD.add(0.5)).clamp(0, 1));
  // Nhìn rất xiên (tia gần song song mặt tường): mỗi điểm ảnh rơi vào một mặt phòng khác nhau ⇒ nhiễu. Hoà về khoảng tối.
  const grazing = smoothstep(0.06, 0.28, dd);
  const interior = mix(roomWall.mul(0.3), roomColor.mul(depthShade), grazing);
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
  const wallPlain = wall.mul(float(0.94).sub(streak)).mul(footDarken).mul(sideShade).mul(floorBand);
  // Vữa loang lổ (texture CC0): mặt tiền nhẹ tay, tường hông / mặt sau đậm hơn (tường hông nhà phố Sài Gòn hay bong tróc, ố mốc).
  const plaster = getTextures('plaster');
  const plasterMean = plaster?.entry.mean;
  const wallColor =
    plaster?.color && plasterMean
      ? wallPlain.mul(
          mix(
            vec3(1, 1, 1),
            // Phóng to ×2 (vết loang to, thưa — đỡ rối mắt và đỡ lộ ô lặp).
            texture(plaster.color, vec2(u.add(seed.mul(17.3)), y).div(plaster.entry.size[0] * 2)).rgb.div(vec3(plasterMean[0], plasterMean[1], plasterMean[2])),
            select(isFront, float(0.28), float(0.6)),
          ).clamp(0.35, 1.5),
        )
      : wallPlain;
  const towerWall = mix(wall, vec3(0.8, 0.82, 0.84), 0.6);

  const roofColor = vec3(0.47, 0.45, 0.42).mul(float(0.85).add(hash(floor(positionWorld.x.mul(0.5)).add(floor(positionWorld.z.mul(0.5)).mul(57))).mul(0.15)));

  const base = select(isTower, towerWall, wallColor);
  // Cửa sổ tầng trệt nhà trong hẻm: kính tối + song sắt dọc.
  const hemWindow = mix(select(fract(u.mul(9)).lessThan(0.14), frameColor, glassDark.mul(1.4)), mix(glassDark.mul(1.4), frameColor, 0.14), patternFade(u, 1 / 9));
  const withShop = select(isShop, shopColor, select(isHemWindow, hemWindow, select(isLintel.and(hemHouse.not()), lintel, base)));
  const withLobby = select(isLobby, mix(glassDark, glassSky, fv.mul(0.6)), withShop);
  const withWindows = select(isFrame.or(bars), frameColor, select(isWindow, glassColor, withLobby));
  mat.colorNode = select(roof, roofColor, withWindows);

  const glassy = isWindow.and(isFrame.not()).or(isLobby);
  const metalShutter = isShop.and(shutterClosed).and(inHem.not());
  mat.roughnessNode = select(glassy, float(0.12), select(metalShutter, float(0.5), float(0.9)));
  // Không gắn ảnh bầu trời cho mặt tiền (đắt: chiếm phần lớn khung hình) ⇒ kính / cửa cuốn ít kim loại để khỏi tối;
  // ánh trời trên kính đã vẽ giả bằng gradient ở trên.
  mat.metalnessNode = select(glassy, float(0.05), select(metalShutter, float(0.15), float(0)));

  // --- Ban đêm: đèn trong nhà hắt ra cửa sổ, cửa hàng còn mở sáng trưng -----------------------------------------
  // Khoảng 45 % ô cửa sáng đèn; nửa đèn vàng ấm, nửa đèn tuýp trắng xanh (rất "Sài Gòn"). Ô có rèm sáng màu rèm.
  const litHash = hash(winHash.mul(13.7).add(3.1));
  const lit = isWindow.and(isFrame.not()).and(bars.not()).and(litHash.lessThan(0.45));
  const lampTone = mix(vec3(1.0, 0.78, 0.48), vec3(0.78, 0.9, 1.0), select(hash(winHash.mul(5.3)).greaterThan(0.5), float(1), float(0)));
  const windowGlow = select(winHash.greaterThan(0.72).and(isTower.not()), curtainPalette.mul(0.6), lampTone.mul(mix(float(0.45), float(0.85), litHash.mul(2.2))));
  // Tiệm còn mở ban đêm: phòng sáng đèn (tuýp trắng xanh hoặc vàng ấm), đèn tuýp trên trần sáng rực, bàn thờ đỏ.
  const roomLight = mix(vec3(1.0, 0.84, 0.6), vec3(0.88, 0.96, 1.0), hash(seed.mul(53)));
  // Nhà trong hẻm: phòng khách đèn dịu hơn tiệm mặt đường.
  const shopLit = roomColor.mul(roomLight).mul(mix(float(0.62), float(0.3), hd.div(roomD.add(0.5)).clamp(0, 1))).mul(select(hemHouse, float(0.3), float(1))).add(select(tube.and(hitBack.or(hitSide).or(hitFloor).not()), vec3(0.8, 0.8, 0.8), vec3(0, 0, 0)));
  const shopGlow = select(isShop.and(shutterClosed.not()), select(altar, vec3(1.0, 0.12, 0.08), shopLit).mul(mix(float(0.35), float(1), grazing)), vec3(0, 0, 0));
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
  // Gạch con sâu (texture CC0) nếu đã tải; không thì ô gạch 0,5 m vẽ thủ tục.
  const tex = groundTexture('pavers', c, 0.9);
  const dry = tex ? tex.color : select(grout, color.mul(0.72), color);
  if (tex?.normal) mat.normalNode = tex.normal;
  // Ướt mưa: sẫm lại và bóng lên.
  mat.colorNode = dry.mul(mix(float(1), float(0.72), wetUniform));
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
  // Bê tông mòn (texture CC0) thay cho hạt lấm tấm thủ tục; khe co giãn và độ đậm nhạt từng tấm vẫn vẽ thủ tục.
  const tex = groundTexture('concrete', c, 0.8);
  const color = tex ? tex.color.mul(float(0.88).add(slabHash.mul(0.18))) : vec3(c.r, c.g, c.b).mul(float(0.84).add(slabHash.mul(0.18)).add(grain.mul(0.06)));
  if (tex?.normal) mat.normalNode = tex.normal;
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
  // Nhựa đường nứt (texture CC0) nếu đã tải; mảng 7 m sáng tối khác nhau để đỡ lộ ô lặp.
  const tex = groundTexture('asphalt', c, 0.75);
  const dry = tex ? tex.color.mul(float(0.9).add(patch.mul(0.12))) : vec3(c.r, c.g, c.b).mul(float(0.88).add(grain.mul(0.1)).add(patch.mul(0.08)));
  if (tex?.normal) mat.normalNode = tex.normal;
  mat.colorNode = dry.mul(mix(float(1), float(0.55), wetUniform));
  mat.roughnessNode = mix(float(0.96), float(0.32), wetUniform).sub(puddle.mul(0.25));
  mat.metalnessNode = puddle.mul(0.25);
  return mat;
}

/**
 * Bảng hiệu: lấy một ô trong atlas (aSign = [u0, v0, du, dv]); aGlow = độ tự sáng ban đêm theo phong cách
 * (hộp đèn / neon sáng rực, bảng alu có LED hắt, bảng sơn tay gần như tối).
 */
export function createSignMaterial(atlas: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const cell = attribute<'vec4'>('aSign', 'vec4');
  const glow = attribute<'float'>('aGlow', 'float');
  const st = uv().mul(cell.zw).add(cell.xy);
  const color = texture(atlas, st).rgb;
  mat.colorNode = color;
  mat.emissiveNode = color.mul(nightUniform.mul(glow));
  return mat;
}

/**
 * Mái tôn sóng (texture CC0): sóng chạy dọc chiều dốc mái (trục z cục bộ của tấm). aSize = kích thước tấm (m) để sóng
 * giữ đúng khoảng cách thật dù tấm to nhỏ khác nhau. Màu tôn (xanh, đỏ, kẽm) lấy từ màu từng bản sao.
 */
export function createRoofSheetMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.15 });
  const tex = getTextures('corrugated');
  const mean = tex?.entry.mean;
  if (!tex?.color || !mean) return mat;
  const size = attribute<'vec3'>('aSize', 'vec3');
  const local = attribute<'vec3'>('position', 'vec3').add(0.5).mul(size);
  const st = vec2(local.x, local.z.negate()).div(tex.entry.size[0]);
  mat.colorNode = texture(tex.color, st).rgb.div(vec3(mean[0], mean[1], mean[2])).clamp(0.3, 1.6);
  return mat;
}

/**
 * Chuồng cọp: khung sắt bọc ban công — song đứng mỗi ~16 cm, nẹp ngang mỗi 0,75 m, khung viền trên dưới.
 * Phần trống cắt bằng alphaTest; aSize = kích thước tấm (m) để song sắt giữ đúng khoảng cách thật.
 */
export function createCageMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide });
  const size = attribute<'vec3'>('aSize', 'vec3');
  const local = attribute<'vec3'>('position', 'vec3').add(0.5).mul(size);
  const along = positionWorld.x.add(positionWorld.z);
  // Nhìn xa / xiên: song dày quá thì thưa bớt (bỏ bớt song) thay vì nhiễu răng cưa.
  const bar = fract(along.mul(6.2)).lessThan(0.16).and(patternFade(along, 1 / 6.2).lessThan(0.5)).or(fract(along.mul(1.55)).lessThan(0.06));
  const band = fract(local.y.div(0.75)).lessThan(0.05);
  const frame = local.y.lessThan(0.05).or(local.y.greaterThan(size.y.sub(0.05)));
  // Mặt trên (mái lồng): lưới ô vuông theo toạ độ thế giới.
  const top = abs(attribute<'vec3'>('normal', 'vec3').y).greaterThan(0.5);
  const grid = fract(positionWorld.x.mul(4)).lessThan(0.12).or(fract(positionWorld.z.mul(4)).lessThan(0.12));
  mat.opacityNode = select(top, select(grid, float(1), float(0)), select(bar.or(band).or(frame), float(1), float(0)));
  mat.alphaTest = 0.5;
  mat.colorNode = vec3(1, 1, 1);
  return mat;
}
