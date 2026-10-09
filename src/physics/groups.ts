/**
 * Nhóm va chạm Rapier: 16 bit cao = "tôi thuộc nhóm nào", 16 bit thấp = "tôi va chạm với nhóm nào".
 */
export const GROUP = {
  WORLD: 1 << 0,
  PLAYER: 1 << 1,
  VEHICLE: 1 << 2,
  PROP: 1 << 3,
  ALL: 0xffff,
} as const;

export const interaction = (membership: number, filter: number): number => ((membership & 0xffff) << 16) | (filter & 0xffff);
