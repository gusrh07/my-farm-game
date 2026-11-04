import { CROPS } from './crops';
import type { Season } from './state';

export interface CropState {
  id: string;
  daysGrown: number;
}

export interface SoilState {
  tilled: boolean;
  watered: boolean;
  crop?: CropState;
}

export class FarmField {
  private soil = new Map<string, SoilState>();

  private key(tx: number, ty: number) {
    return `${tx},${ty}`;
  }

  get(tx: number, ty: number): Readonly<SoilState> | undefined {
    return this.soil.get(this.key(tx, ty));
  }

  till(tx: number, ty: number, isTillable: boolean): boolean {
    if (!isTillable || this.get(tx, ty)) return false;
    this.soil.set(this.key(tx, ty), { tilled: true, watered: false });
    return true;
  }

  plant(tx: number, ty: number, cropId: string): boolean {
    const soil = this.soil.get(this.key(tx, ty));
    if (!soil?.tilled || soil.crop || !Object.hasOwn(CROPS, cropId)) return false;
    soil.crop = { id: cropId, daysGrown: 0 };
    return true;
  }

  water(tx: number, ty: number): boolean {
    const soil = this.soil.get(this.key(tx, ty));
    if (!soil?.tilled || soil.watered) return false;
    soil.watered = true;
    return true;
  }

  isRipe(tx: number, ty: number): boolean {
    const crop = this.get(tx, ty)?.crop;
    return !!crop && crop.daysGrown >= CROPS[crop.id].growDays;
  }

  harvest(tx: number, ty: number): string | null {
    if (!this.isRipe(tx, ty)) return null;
    const soil = this.soil.get(this.key(tx, ty))!;
    const id = soil.crop!.id;
    delete soil.crop;
    return id;
  }

  waterAll() {
    for (const soil of this.soil.values()) soil.watered = true;
  }

  advanceDay() {
    for (const soil of this.soil.values()) {
      if (soil.crop && soil.watered) {
        soil.crop.daysGrown = Math.min(soil.crop.daysGrown + 1, CROPS[soil.crop.id].growDays);
      }
      soil.watered = false;
    }
  }

  witherOutOfSeason(season: Season): number {
    let count = 0;
    for (const soil of this.soil.values()) {
      if (soil.crop && !CROPS[soil.crop.id].seasons.includes(season)) {
        delete soil.crop; // Mature crops also wither; tilled soil remains.
        count++;
      }
    }
    return count;
  }

  entries(): [string, SoilState][] {
    return Array.from(this.soil, ([key, state]) => [key, {
      ...state,
      ...(state.crop ? { crop: { ...state.crop } } : {}),
    }]);
  }

  // 작물까지 복사해 JSON.stringify로 저장할 수 있는 독립적인 스냅샷입니다.
  load(entries: unknown): void {
    if (!Array.isArray(entries)) throw new Error('밭 데이터 형식 오류');
    const restored = new Map<string, SoilState>();
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new Error('밭 항목 오류');
      const [key, soil] = entry;
      if (typeof key !== 'string' || !/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key) || restored.has(key)) throw new Error('밭 좌표 오류');
      if (!soil || typeof soil !== 'object' || soil.tilled !== true || typeof soil.watered !== 'boolean') throw new Error('경작 상태 오류');
      const state: SoilState = { tilled: true, watered: soil.watered };
      if (soil.crop !== undefined) {
        const crop = soil.crop;
        if (!crop || typeof crop.id !== 'string' || !Object.hasOwn(CROPS, crop.id)
          || !Number.isSafeInteger(crop.daysGrown) || crop.daysGrown < 0 || crop.daysGrown > CROPS[crop.id].growDays) throw new Error('작물 상태 오류');
        state.crop = { id: crop.id, daysGrown: crop.daysGrown };
      }
      restored.set(key, state);
    }
    this.soil = restored;
  }

  toJSON(): [string, SoilState][] {
    return this.entries();
  }
}
