/**
 * Nhóm va chạm Rapier: 16 bit cao = "tôi thuộc nhóm nào", 16 bit thấp = "tôi va chạm với nhóm nào".
 */
export const GROUP = {
  WORLD: 1 << 0,
  PLAYER: 1 << 1,
  VEHICLE: 1 << 2,
  PROP: 1 << 3,
  /** Thân ô tô (thuộc thêm nhóm này ngoài VEHICLE). */
  CAR: 1 << 4,
  /** Trụ chắn miệng hẻm: chỉ va chạm với ô tô — xe máy, người đi bộ lọt qua. */
  CAR_BLOCK: 1 << 5,
  ALL: 0xffff,
} as const;

export const interaction = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);
