import { describe, expect, it } from 'vitest';
import { generateCity } from '@/world/city/layout';
import { locate, PLACE_NAMES } from '@/world/city/locate';

const city = generateCity();

describe('locate', () => {
  it('trên đường → tên đường; ở giao lộ → ngã tư', () => {
    const avenue = city.roads.find((r) => r.kind === 'avenue' && r.axis === 'x')!;
    const loc = locate(city, -100, avenue.pos);
    expect(['road', 'intersection']).toContain(loc.kind);
    const cross = city.roads.find((r) => r.axis === 'z' && r.kind === 'street')!;
    const at = locate(city, cross.pos, avenue.pos);
    expect(at.kind).toBe('intersection');
    expect(at.name).toContain('Ngã tư');
  });

  it('trong hẻm → "Hẻm <số> <tên đường>"', () => {
    const hem = city.hems.find((h) => h.kind === 'main')!;
    const loc = locate(city, (hem.rect.x0 + hem.rect.x1) / 2, (hem.rect.z0 + hem.rect.z1) / 2);
    expect(loc.kind).toBe('hem');
    expect(loc.name).toMatch(/^Hẻm \d+ /);
    const branch = city.hems.find((h) => h.kind === 'branch')!;
    const b = locate(city, (branch.rect.x0 + branch.rect.x1) / 2, (branch.rect.z0 + branch.rect.z1) / 2);
    expect(b.name).toMatch(/^Hẻm \d+(\/\d+)? /);
  });

  it('chợ, công viên, bờ sông', () => {
    expect(locate(city, city.spawn.x, city.spawn.z).name).toBe(PLACE_NAMES.market);
    expect(locate(city, city.park.fountain.x, city.park.fountain.z).name).toBe(PLACE_NAMES.park);
    expect(locate(city, 0, (city.river.promenade.z0 + city.river.promenade.z1) / 2).name).toBe(PLACE_NAMES.river);
  });
});
