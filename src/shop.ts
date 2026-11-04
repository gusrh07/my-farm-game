import { CROPS } from './crops';
import type { GameState } from './state';
import { MATERIAL_PRICE } from './items';
import { FISH } from './fish';
export function sellOneFish(state: GameState, id: string): number {
  const fish = FISH.find(f => `fish:${f.id}` === id);
  if (!fish || !state.removeItem(id)) return 0;
  state.gold += fish.sell;
  return fish.sell;
}

export function sellOneMaterial(state: GameState, id: string): number {
  if (!Object.hasOwn(MATERIAL_PRICE, id) || !state.removeItem(id)) return 0;
  const price = MATERIAL_PRICE[id].sell;
  state.gold += price;
  return price;
}

export function sellOneCrop(state: GameState, cropId: string): number {
  if (!Object.hasOwn(CROPS, cropId)) return 0;
  if (!state.removeItem(`crop:${cropId}`)) return 0;
  const price = CROPS[cropId].sellPrice;
  state.gold += price;
  return price;
}

export function sellAllCrops(state: GameState): number {
  let total = 0;
  for (const [itemId, n] of Object.entries(state.inventory)) {
    if (!itemId.startsWith('crop:')) continue;
    const cropId = itemId.slice(5);
    if (!Object.hasOwn(CROPS, cropId) || !Number.isSafeInteger(n) || n <= 0) continue;
    if (state.removeItem(itemId, n)) total += CROPS[cropId].sellPrice * n;
  }
  state.gold += total;
  return total;
}

export function buySeed(state: GameState, cropId: string, n = 1): boolean {
  if (!Object.hasOwn(CROPS, cropId) || !Number.isSafeInteger(n) || n <= 0) return false;
  const cost = CROPS[cropId].seedPrice * n;
  if (!Number.isSafeInteger(cost) || state.gold < cost) return false;
  if (!state.addItem(`seed:${cropId}`, n)) return false;
  state.gold -= cost;
  state.ensureSeedSelected();
  return true;
}
