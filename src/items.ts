import { CROPS } from './crops';
import { CHEST_DEFS } from './chests';
import { FISH } from './fish';

export const MATERIAL_PRICE: Record<string, { name: string; sell: number }> = {
  'material:wood': { name: '목재', sell: 10 },
};
export type ItemCategory = 'seed' | 'crop' | 'material' | 'item' | 'fish';
export interface ItemInfo { name: string; category: ItemCategory; sell?: number }
export function itemInfo(id: string): ItemInfo {
  const [prefix, key] = id.split(':');
  if (prefix === 'fish') {
    const fish = FISH.find(f => f.id === key);
    return { name: fish?.name ?? id, category: 'fish', sell: fish?.sell };
  }
  const crop = Object.hasOwn(CROPS, key) ? CROPS[key] : undefined;
  if (prefix === 'seed') return { name: crop ? `${crop.name} 씨앗` : id, category: 'seed' };
  if (prefix === 'crop') return { name: crop?.name ?? id, category: 'crop', sell: crop?.sellPrice };
  if (prefix === 'item') return { name: Object.hasOwn(CHEST_DEFS, key) ? CHEST_DEFS[key].name : id, category: 'item' };
  const material = Object.hasOwn(MATERIAL_PRICE, id) ? MATERIAL_PRICE[id] : undefined;
  return { name: material?.name ?? id, category: 'material', sell: material?.sell };
}
export function parseInventory(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('인벤토리 오류');
  const result: Record<string, number> = {};
  for (const [id, count] of Object.entries(value)) {
    const match = /^(seed|crop|item):([^:]+)$/.exec(id);
    const known = FISH.some(f => id === `fish:${f.id}`) || Object.hasOwn(MATERIAL_PRICE, id) || (match && Object.hasOwn(match[1] === 'item' ? CHEST_DEFS : CROPS, match[2]));
    if (!known || typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) throw new Error('아이템 오류');
    result[id] = count;
  }
  return result;
}
