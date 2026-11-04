import type { GameState } from './state';
export interface Recipe {
  id: string; name: string; cost: Record<string, number>;
  result: { kind: 'chest'; type: string };
}
export const RECIPES: Recipe[] = [
  { id: 'wood_chest', name: '나무상자', cost: { 'material:wood': 10 }, result: { kind: 'chest', type: 'wood_chest' } },
];
export function canCraft(state: GameState, recipe: Recipe) {
  return Object.entries(recipe.cost).every(([id, n]) => state.count(id) >= n);
}
export function craft(state: GameState, recipe: Recipe): boolean {
  if (!RECIPES.includes(recipe) || !canCraft(state, recipe)) return false;
  if (!state.addItem(`item:${recipe.result.type}`)) return false;
  for (const [id, n] of Object.entries(recipe.cost)) state.removeItem(id, n);
  return true;
}
