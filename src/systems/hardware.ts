/**
 * Nhận diện sức máy để dựng cảnh vừa sức ngay từ đầu (thuần logic, có unit test; phần đọc trình duyệt ở `probeHardware`).
 * Không có cách nào biết chắc FPS trước khi chạy, nên đây chỉ là điểm xuất phát: ở mức "Tự động", ResolutionGovernor
 * vẫn đo FPS thật rồi hạ / nâng tiếp.
 */

export type GpuClass = 'software' | 'integrated' | 'discrete' | 'unknown';
export type Tier = 'low' | 'medium' | 'high';

export interface HardwareInfo {
  /** Tên card đồ hoạ trình duyệt báo (có thể rỗng nếu bị ẩn). */
  gpu: string;
  /** Số luồng CPU (navigator.hardwareConcurrency). */
  cores: number;
  /** RAM (GB, navigator.deviceMemory — Chrome làm tròn, tối đa 8); null nếu không biết. */
  memoryGB: number | null;
  /** Điện thoại / máy tính bảng. */
  mobile: boolean;
  /** Số điểm ảnh thật của màn hình (rộng × cao × devicePixelRatio²). */
  screenPixels: number;
}

/** Phân loại card đồ hoạ theo tên (ANGLE trên Chrome trả dạng "ANGLE (Intel, Intel(R) UHD Graphics 620 …)"). */
export function classifyGpu(name: string): GpuClass {
  const n = name.toLowerCase();
  if (!n.trim()) return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(n)) return 'software';
  // Card rời: NVIDIA GeForce / RTX / GTX / Quadro, AMD Radeon RX / Pro / R9, Intel Arc.
  if (/geforce|nvidia|rtx|gtx|quadro|radeon\s*(rx|pro|r9|r7 [0-9]{3})|\bintel\(r\) arc|\barc a[0-9]/.test(n)) return 'discrete';
  // Card tích hợp: Intel HD / UHD / Iris, AMD Radeon Graphics / Vega (APU), Apple, điện thoại (Mali, Adreno, PowerVR).
  if (/intel|iris|uhd|\bhd graphics|radeon\(tm\) graphics|radeon graphics|vega|apple|\bm[1-9]\b|mali|adreno|powervr|videocore/.test(n)) return 'integrated';
  return 'unknown';
}

/** Card tích hợp đời mới, khoẻ gần card rời tầm thấp. */
function strongIntegrated(name: string): boolean {
  const n = name.toLowerCase();
  return /apple m[1-9]|\bm[1-9] (pro|max|ultra)|iris\(r\) xe|iris xe|radeon 7[0-9]0m|radeon 8[0-9]0m/.test(n);
}

const DOWN: Record<Tier, Tier> = { high: 'medium', medium: 'low', low: 'low' };

/** Bậc máy gợi ý cho dựng cảnh. */
export function detectTier(info: HardwareInfo): Tier {
  const gpu = classifyGpu(info.gpu);
  let tier: Tier;
  if (gpu === 'software') return 'low';
  if (info.mobile) tier = 'low';
  else if (gpu === 'discrete') tier = 'high';
  else if (gpu === 'integrated') tier = strongIntegrated(info.gpu) ? 'medium' : 'low';
  else tier = 'medium';
  // CPU / RAM yếu: hạ một bậc (vật lý, giao thông, dựng shader đều chạy trên CPU).
  if ((info.cores > 0 && info.cores <= 2) || (info.memoryGB !== null && info.memoryGB <= 2)) tier = DOWN[tier];
  // Màn hình rất nét (≥ 4K thật) với card tích hợp: quá nhiều điểm ảnh.
  if (gpu !== 'discrete' && info.screenPixels >= 8_000_000) tier = DOWN[tier];
  return tier;
}

/** Ngân sách dựng cảnh theo bậc máy. */
export interface SceneBudget {
  /** Xe máy NPC chạy quanh người chơi. */
  traffic: number;
  /** Người đi bộ. */
  pedestrians: number;
  /** Hạt mưa quanh camera. */
  rain: number;
  /** Cạnh bản đồ bóng đổ (điểm ảnh). */
  shadowMapSize: number;
}

export const SCENE_BUDGETS: Record<Tier, SceneBudget> = {
  low: { traffic: 40, pedestrians: 30, rain: 4000, shadowMapSize: 1024 },
  medium: { traffic: 60, pedestrians: 45, rain: 6500, shadowMapSize: 2048 },
  high: { traffic: 80, pedestrians: 60, rain: 9000, shadowMapSize: 2048 },
};

export const TIER_LABELS: Record<Tier, string> = { low: 'yếu', medium: 'trung bình', high: 'mạnh' };

/** Rút gọn tên card cho dễ đọc: "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x…) Direct3D11 …)" → "Intel(R) UHD Graphics 620". */
export function shortGpuName(name: string): string {
  const angle = /^ANGLE \(([^,]+),\s*([^,(]+(?:\([^)]*\)[^,(]*)*)/.exec(name);
  const raw = angle ? (angle[2] as string) : name;
  return raw.replace(/\s*\(0x[0-9a-f]+\)/gi, '').replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').trim() || 'không rõ';
}

/** Đọc thông tin máy từ trình duyệt (WebGL debug info — trình duyệt có thể ẩn tên card). */
export function probeHardware(): HardwareInfo {
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // Trình duyệt chặn: coi như không rõ.
  }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const dpr = window.devicePixelRatio || 1;
  return {
    gpu,
    cores: nav.hardwareConcurrency || 0,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    mobile: nav.userAgentData?.mobile ?? /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    screenPixels: Math.round(screen.width * screen.height * dpr * dpr),
  };
}
