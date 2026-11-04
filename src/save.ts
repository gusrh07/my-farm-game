import { GameState } from './state';
export const SAVE_KEY = 'my-farm-game:save:v1';
export function readSave(storage: Pick<Storage, 'getItem'> = localStorage): GameState | null {
  const saved = storage.getItem(SAVE_KEY);
  if (saved === null) return null;
  const state = new GameState();
  state.load(saved);
  return state;
}
export function writeSave(state: GameState, storage: Pick<Storage, 'setItem' | 'getItem'> = localStorage) {
  const data = state.serialize();
  storage.setItem(SAVE_KEY, data);
  if (storage.getItem(SAVE_KEY) !== data) throw new Error('저장 확인 실패');
}
