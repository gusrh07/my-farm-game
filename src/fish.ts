import type { Season } from './state';
export interface FishDef { id: string; name: string; sell: number; seasons: Season[]; weight: number }
export const FISH: FishDef[] = [
  { id: 'carp', name: '잉어', sell: 30, seasons: ['spring','summer','fall','winter'], weight: 5 },
  { id: 'bass', name: '배스', sell: 60, seasons: ['summer','fall'], weight: 3 },
  { id: 'salmon', name: '연어', sell: 90, seasons: ['fall','winter'], weight: 2 },
];
export function pickFish(season: Season, rand = Math.random): FishDef {
  const candidates = FISH.filter(fish => fish.seasons.includes(season));
  let roll = rand() * candidates.reduce((sum, fish) => sum + fish.weight, 0);
  for (const fish of candidates) { roll -= fish.weight; if (roll < 0) return fish; }
  return candidates[candidates.length - 1];
}

// Transient timing only: deliberately excluded from saved game state.
export class FishingAttempt {
  phase: 'waiting' | 'bite' | 'done' = 'waiting';
  private elapsed = 0;
  readonly waitMs: number;
  constructor(rand = Math.random) { this.waitMs = 2000 + rand() * 4000; }
  tick(delta: number): 'bite' | 'miss' | null {
    if (this.phase === 'done') return null;
    this.elapsed += Math.max(0, delta);
    if (this.elapsed >= this.waitMs + 1000) { this.phase = 'done'; return 'miss'; }
    if (this.phase === 'waiting' && this.elapsed >= this.waitMs) { this.phase = 'bite'; return 'bite'; }
    return null;
  }
  strike(): boolean {
    const success = this.phase === 'bite';
    this.phase = 'done';
    return success;
  }
}
