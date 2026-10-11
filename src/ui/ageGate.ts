/**
 * Màn hình cảnh báo 18+ lúc vào game lần đầu: nói rõ nội dung (đánh nhau, máu nhẹ, ngôn ngữ chợ búa, châm biếm),
 * cho tắt máu ngay tại đây. Xác nhận xong thì không hỏi lại (lưu trong cài đặt).
 */
export function showAgeGate(parent: HTMLElement, blood: boolean): Promise<{ blood: boolean }> {
  const root = document.createElement('div');
  root.className = 'age-gate';
  root.innerHTML = `<div class="age-card" role="dialog" aria-modal="true" aria-labelledby="age-title">
    <div class="age-badge">18+</div>
    <h2 id="age-title">HẺM — Sài Gòn Không Ngủ</h2>
    <p>Game dành cho người từ <b>18 tuổi</b> trở lên. Trong game có:</p>
    <ul>
      <li>đánh nhau tay không và bằng hung khí (mã tấu, gậy, ghế nhựa…);</li>
      <li>máu nhẹ khi trúng đòn — tắt được;</li>
      <li>ngôn ngữ chợ búa, giang hồ;</li>
      <li>châm biếm chuyện vay nợ qua app, mạng xã hội, "xã hội đen" phố.</li>
    </ul>
    <p class="age-note">Mọi nhân vật, địa danh, thương hiệu đều hư cấu. Ngoài đời đánh người là phạm pháp — chỉ chơi trong game thôi nhé.</p>
    <label class="age-blood"><input type="checkbox" data-age-blood ${blood ? '' : 'checked'} /> Tắt máu <small>(đổi lại được ở Điện thoại → Cài đặt)</small></label>
    <div class="age-actions">
      <button type="button" class="age-ok" data-age-ok>Tôi đủ 18 tuổi — Vào game</button>
      <button type="button" class="age-leave" data-age-leave>Rời đi</button>
    </div>
  </div>`;
  parent.appendChild(root);
  const ok = root.querySelector('[data-age-ok]') as HTMLButtonElement;
  ok.focus();
  return new Promise((resolve) => {
    root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-age-leave]')) {
        const card = root.querySelector('.age-card') as HTMLElement;
        card.innerHTML = '<div class="age-badge">18+</div><h2>Hẹn gặp lại khi bạn đủ 18 tuổi!</h2><p>Có thể đóng thẻ này.</p>';
        return;
      }
      if (!el.closest('[data-age-ok]')) return;
      const off = (root.querySelector('[data-age-blood]') as HTMLInputElement).checked;
      root.remove();
      resolve({ blood: !off });
    });
  });
}
