import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { NightBloom } from '@/render/bloom';

describe('NightBloom', () => {
  afterEach(() => vi.restoreAllMocks());

  it('làm nóng một lần: lúc tải nếu đang bật; tắt lúc tải rồi bật trong Cài đặt thì làm nóng ngay lúc bật', () => {
    // Lượt vẽ thật cần card đồ hoạ: chỉ đếm số lần vẽ qua bloom.
    const render = vi.spyOn(THREE.RenderPipeline.prototype, 'render').mockImplementation(() => undefined);
    const fresh = (): NightBloom => new NightBloom({} as THREE.WebGPURenderer, new THREE.Scene(), new THREE.PerspectiveCamera());

    // Bật sẵn: cài đặt áp trước màn hình tải chưa vẽ gì; làm nóng lúc tải vẽ một lần.
    const on = fresh();
    on.setScale(0.5);
    expect(render).not.toHaveBeenCalled();
    on.warm();
    expect(render).toHaveBeenCalledTimes(1);
    on.setScale(0.35);
    expect(render).toHaveBeenCalledTimes(1);

    // Mức Thấp lúc tải (tắt) ⇒ chưa làm nóng; lên mức Vừa giữa lúc chơi ⇒ làm nóng ngay, một lần thôi.
    render.mockClear();
    const low = fresh();
    low.setScale(0);
    low.warm();
    expect(render).not.toHaveBeenCalled();
    low.setScale(0.35);
    expect(render).toHaveBeenCalledTimes(1);
    low.setScale(0);
    low.setScale(0.5);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
