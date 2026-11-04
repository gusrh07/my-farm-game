import type { Season } from './state';

export interface CropDef {
  id: string;
  name: string;
  growDays: number;
  sellPrice: number;
  seedPrice: number;
  color: number;
  seasons: Season[];
}

export const CROPS: Record<string, CropDef> = {
  turnip: { id: 'turnip', name: '순무', growDays: 1, sellPrice: 40, seedPrice: 20, color: 0xe1bee7, seasons: ['spring', 'fall'] },
  potato: { id: 'potato', name: '감자', growDays: 5, sellPrice: 80, seedPrice: 35, color: 0xd7ccc8, seasons: ['spring'] },
  corn: { id: 'corn', name: '옥수수', growDays: 4, sellPrice: 90, seedPrice: 40, color: 0xffeb3b, seasons: ['summer'] },
  pumpkin: { id: 'pumpkin', name: '호박', growDays: 6, sellPrice: 140, seedPrice: 60, color: 0xff9800, seasons: ['fall'] },
};
