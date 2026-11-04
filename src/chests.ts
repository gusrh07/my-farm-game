export interface ChestDef { id: string; name: string; sprite: string; capacity: number | null; hp: number }
export const CHEST_DEFS: Record<string, ChestDef> = {
  wood_chest: { id: 'wood_chest', name: '나무상자', sprite: 'chest', capacity: null, hp: 3 },
};
export interface ChestInstance { type: string; tx: number; ty: number; items: Record<string, number>; hp?: number }
export function chestAt(chests: ChestInstance[], tx: number, ty: number) {
  return chests.find(c => c.tx === tx && c.ty === ty);
}
