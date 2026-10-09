import { uniform } from 'three/tsl';

/**
 * Mức "đêm" dùng chung cho mọi vật liệu phát sáng ban đêm (cửa sổ, bảng hiệu, đèn đường, đèn xe…):
 * 0 = ban ngày, 1 = tối hẳn. Môi trường cập nhật mỗi khung hình theo đồng hồ game.
 */
export const nightUniform = uniform(0);

/** Độ ướt mặt đường 0..1 (mưa): nhựa đường, vỉa hè sẫm lại và bóng lên. */
export const wetUniform = uniform(0);
