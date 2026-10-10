import { describe, expect, it } from 'vitest';
import { classifyGpu, detectTier, SCENE_BUDGETS, shortGpuName, type HardwareInfo } from '@/systems/hardware';

const pc = (gpu: string, extra: Partial<HardwareInfo> = {}): HardwareInfo => ({
  gpu,
  cores: 8,
  memoryGB: 8,
  mobile: false,
  screenPixels: 1920 * 1080,
  ...extra,
});

describe('nhận diện card đồ hoạ', () => {
  it('phân loại theo tên trình duyệt báo', () => {
    expect(classifyGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')).toBe('software');
    expect(classifyGpu('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('software');
    expect(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('discrete');
    expect(classifyGpu('ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('discrete');
    expect(classifyGpu('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('integrated');
    expect(classifyGpu('ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001636) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('integrated');
    expect(classifyGpu('Apple M1')).toBe('integrated');
    expect(classifyGpu('Mali-G57')).toBe('integrated');
    expect(classifyGpu('')).toBe('unknown');
  });

  it('bậc máy: card rời mạnh, Intel UHD yếu, Iris Xe / Apple M vừa, phần mềm luôn yếu', () => {
    expect(detectTier(pc('NVIDIA GeForce GTX 1650'))).toBe('high');
    expect(detectTier(pc('Intel(R) UHD Graphics 620'))).toBe('low');
    expect(detectTier(pc('Intel(R) Iris(R) Xe Graphics'))).toBe('medium');
    expect(detectTier(pc('Apple M2'))).toBe('medium');
    expect(detectTier(pc('SwiftShader'))).toBe('low');
    expect(detectTier(pc(''))).toBe('medium');
  });

  it('CPU / RAM yếu, màn hình 4K với card tích hợp, điện thoại: hạ bậc', () => {
    expect(detectTier(pc('NVIDIA GeForce GTX 1650', { cores: 2 }))).toBe('medium');
    expect(detectTier(pc('NVIDIA GeForce GTX 1650', { memoryGB: 2 }))).toBe('medium');
    expect(detectTier(pc('Apple M2', { screenPixels: 3840 * 2160 }))).toBe('low');
    expect(detectTier(pc('NVIDIA GeForce RTX 4070', { screenPixels: 3840 * 2160 }))).toBe('high');
    expect(detectTier(pc('Adreno (TM) 650', { mobile: true }))).toBe('low');
  });

  it('ngân sách cảnh giảm dần theo bậc', () => {
    expect(SCENE_BUDGETS.low.traffic).toBeLessThan(SCENE_BUDGETS.medium.traffic);
    expect(SCENE_BUDGETS.medium.traffic).toBeLessThan(SCENE_BUDGETS.high.traffic);
    expect(SCENE_BUDGETS.low.shadowMapSize).toBeLessThan(SCENE_BUDGETS.high.shadowMapSize);
    expect(SCENE_BUDGETS.low.nearPedestrians).toBeLessThan(SCENE_BUDGETS.high.nearPedestrians);
  });

  it('rút gọn tên card', () => {
    expect(shortGpuName('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('Intel(R) UHD Graphics 620');
    expect(shortGpuName('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe('NVIDIA GeForce RTX 3060 Laptop GPU');
    expect(shortGpuName('Apple M1')).toBe('Apple M1');
    expect(shortGpuName('')).toBe('không rõ');
  });
});
