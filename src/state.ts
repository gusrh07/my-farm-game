import { FarmField } from './farming';
import { CROPS } from './crops';
import { tileAt, SPAWN, TILE_SIZE, PLAYER_SIZE, type Point } from './world';
import { INITIAL_BUILDINGS, isBuildingTile } from './buildings';
import { createInitialProps, isPropTile, loadProps, findPropAt, PROP_DEFS, advancePropsOneDay, isFree } from './props';
import { parseInventory } from './items';
import { CHEST_DEFS, chestAt, type ChestInstance } from './chests';

export const REAL_MS_PER_GAME_10MIN = 7000;
export const DAY_START = 6 * 60;
export const DAY_END = 24 * 60;
export const TOOL_COST = { hoe: 2, water: 1, seed: 0, harvest: 0, axe: 4, rod: 2 } as const;
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
export const DAYS_PER_SEASON = 28;
export type Weather = 'sunny' | 'rain';
export const WEATHER_LABEL: Record<Weather, string> = { sunny: '맑음', rain: '비' };
export const RAIN_CHANCE = 0.2;

export type Inventory = Record<string, number>;

export class GameState {
  day = 1;
  minutes = DAY_START;
  private timeAcc = 0;
  gold = 100;
  readonly maxEnergy = 100;
  energy = this.maxEnergy;
  inventory: Inventory = { 'seed:turnip': 5 };
  field = new FarmField();
  buildings = INITIAL_BUILDINGS.map(building => ({ ...building }));
  props = createInitialProps(this.buildings);
  chests: ChestInstance[] = [];
  playerPosition: Point = { ...SPAWN }; // Runtime-only exclusion area for tree growth.
  selectedSeed = 'turnip';
  weather: Weather = 'sunny';
  tomorrowWeather: Weather = 'sunny';
  // Transient result of the latest sleep, shared by manual and automatic sleep.
  lastWitheredCount = 0;

  get season(): Season {
    return SEASONS[Math.floor((this.day - 1) / DAYS_PER_SEASON) % SEASONS.length];
  }

  get dayOfSeason(): number {
    return ((this.day - 1) % DAYS_PER_SEASON) + 1;
  }

  rollWeather(): Weather {
    return Math.random() < RAIN_CHANCE ? 'rain' : 'sunny';
  }

  canPlant(cropId: string): boolean {
    return Object.hasOwn(CROPS, cropId) && CROPS[cropId].seasons.includes(this.season);
  }

  useEnergy(cost: number): boolean {
    if (!Number.isSafeInteger(cost) || cost < 0 || this.energy < cost) return false;
    this.energy -= cost;
    return true;
  }

  till(tx: number, ty: number): boolean {
    if (this.energy < TOOL_COST.hoe || !this.field.till(tx, ty, tileAt(tx, ty) === 0 && !isBuildingTile(this.buildings, tx, ty) && !isPropTile(this.props, tx, ty) && !chestAt(this.chests, tx, ty))) return false;
    this.useEnergy(TOOL_COST.hoe);
    this.props = this.props.filter(p => !(p.type === 'sapling' && p.tx === tx && p.ty === ty));
    if (this.weather === 'rain') this.field.water(tx, ty);
    return true;
  }

  water(tx: number, ty: number): boolean {
    if (this.energy < TOOL_COST.water || !this.field.water(tx, ty)) return false;
    this.useEnergy(TOOL_COST.water);
    return true;
  }

  // Fractional time for smooth lighting; pauses with main and resets on load/sleep.
  get lightingMinutes(): number {
    return this.minutes + this.timeAcc / REAL_MS_PER_GAME_10MIN * 10;
  }

  get timeLabel(): string {
    return `${String(Math.floor(this.minutes / 60) % 24).padStart(2, '0')}:${String(this.minutes % 60).padStart(2, '0')}`;
  }

  // 자정이면 하루를 넘기고 true를 반환합니다. 메인 씬이 멈추면 호출도 멈춥니다.
  advanceTime(delta: number): boolean {
    this.timeAcc += delta;
    while (this.timeAcc >= REAL_MS_PER_GAME_10MIN) {
      this.timeAcc -= REAL_MS_PER_GAME_10MIN;
      this.minutes += 10;
      if (this.minutes >= DAY_END) {
        this.sleep(true);
        return true;
      }
    }
    return false;
  }

  sleep(forced = false) {
    // 오늘의 비로 성장한 뒤, 새 날짜의 날씨를 적용합니다.
    if (this.weather === 'rain') this.field.waterAll();
    this.field.advanceDay();
    this.day += 1;
    advancePropsOneDay(this.props, (x, y) => this.isPropSpotFree(x, y));
    this.lastWitheredCount = this.dayOfSeason === 1 ? this.field.witherOutOfSeason(this.season) : 0;
    this.minutes = DAY_START;
    this.timeAcc = 0;
    this.energy = forced ? Math.floor(this.maxEnergy * 0.7) : this.maxEnergy;
    this.weather = this.tomorrowWeather;
    this.tomorrowWeather = this.rollWeather();
    if (this.weather === 'rain') this.field.waterAll();
  }

  serialize(): string {
    return JSON.stringify({
      version: 1, day: this.day, minutes: this.minutes,
      energy: this.energy,
      weather: this.weather, tomorrowWeather: this.tomorrowWeather,
      gold: this.gold, inventory: this.inventory, selectedSeed: this.selectedSeed,
      field: this.field.toJSON(),
      props: this.props,
      chests: this.chests,
    });
  }

  // 검증을 모두 마친 후 반영하여 실패 시 현재 게임을 보존합니다.
  load(serialized: string): void {
    const data = JSON.parse(serialized);
    if (!data || data.version !== 1) throw new Error('지원하지 않는 저장 형식');
    const minutes = data.minutes ?? DAY_START; // 기존 60초 하루 저장은 06:00부터 재개
    const energy = data.energy === undefined ? this.maxEnergy : data.energy;
    const weather = data.weather === undefined ? 'sunny' : data.weather;
    const tomorrowWeather = data.tomorrowWeather === undefined ? 'sunny' : data.tomorrowWeather;
    if (!['sunny', 'rain'].includes(weather) || !['sunny', 'rain'].includes(tomorrowWeather)) throw new Error('날씨 오류');
    if (!Number.isSafeInteger(energy) || energy < 0 || energy > this.maxEnergy) throw new Error('에너지 오류');
    if (!Number.isSafeInteger(data.day) || data.day < 1
      || !Number.isSafeInteger(data.gold) || data.gold < 0
      || !Number.isSafeInteger(minutes) || minutes < DAY_START || minutes >= DAY_END
      || minutes % 10 !== 0) throw new Error('날짜·돈·시간 오류');
    if (typeof data.selectedSeed !== 'string' || !Object.hasOwn(CROPS, data.selectedSeed)) throw new Error('선택 씨앗 오류');
    const inventory = parseInventory(data.inventory);
    const field = new FarmField();
    field.load(data.field);
    for (const [key] of field.entries()) {
      const [col, row] = key.split(',').map(Number);
      if (tileAt(col, row) !== 0) throw new Error('경작할 수 없는 좌표');
      if (isBuildingTile(this.buildings, col, row)) throw new Error('저장된 밭과 집 위치가 겹칩니다');
    }
    // Old saves keep their cultivated tiles: omit generated trees on those tiles.
    const props = data.props === undefined
      ? createInitialProps(this.buildings).filter(p => !field.get(p.tx, p.ty))
      : loadProps(data.props, this.buildings);
    for (const p of props) if (field.get(p.tx, p.ty)) throw new Error('나무와 밭이 겹칩니다');
    const rawChests = data.chests ?? [];
    if (!Array.isArray(rawChests)) throw new Error('상자 목록 오류');
    const chests: ChestInstance[] = [];
    for (const c of rawChests) {
      if (!c || typeof c.type !== 'string' || !Object.hasOwn(CHEST_DEFS, c.type)
        || !Number.isSafeInteger(c.tx) || !Number.isSafeInteger(c.ty) || tileAt(c.tx, c.ty) !== 0
        || isBuildingTile(this.buildings, c.tx, c.ty) || findPropAt(props, c.tx, c.ty)
        || field.get(c.tx, c.ty) || chestAt(chests, c.tx, c.ty)) throw new Error('상자 위치 오류');
      const d = CHEST_DEFS[c.type];
      if (c.hp !== undefined && (!Number.isSafeInteger(c.hp) || c.hp < 1 || c.hp > d.hp)) throw new Error('상자 체력 오류');
      const items = parseInventory(c.items);
      if (d.capacity !== null && Object.keys(items).length > d.capacity) throw new Error('상자 용량 오류');
      chests.push({ type: c.type, tx: c.tx, ty: c.ty, items, ...(c.hp === undefined ? {} : { hp: c.hp }) });
    }
    this.chests = chests;
    this.props = props;
    this.day = data.day;
    this.lastWitheredCount = 0;
    this.minutes = minutes;
    this.timeAcc = 0;
    this.gold = data.gold;
    this.energy = energy;
    this.weather = weather;
    this.tomorrowWeather = tomorrowWeather;
    this.inventory = inventory;
    this.selectedSeed = data.selectedSeed;
    this.field = field;
    if (this.weather === 'rain') this.field.waterAll();
    this.ensureSeedSelected();
  }

  private ownedSeeds(): string[] {
    return Object.keys(CROPS).filter(id => this.count(`seed:${id}`) > 0);
  }

  ensureSeedSelected() {
    if (this.count(`seed:${this.selectedSeed}`) > 0) return;
    const owned = this.ownedSeeds();
    if (owned.length > 0) this.selectedSeed = owned[0];
  }

  cycleSeed() {
    const owned = this.ownedSeeds();
    if (owned.length === 0) return;
    this.selectedSeed = owned[(owned.indexOf(this.selectedSeed) + 1) % owned.length];
  }

  count(id: string): number {
    return Object.hasOwn(this.inventory, id) ? this.inventory[id] : 0;
  }

  addItem(id: string, n = 1): boolean {
    if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(this.count(id) + n)) return false;
    Object.defineProperty(this.inventory, id, { value: this.count(id) + n, writable: true, enumerable: true, configurable: true });
    return true;
  }

  removeItem(id: string, n = 1): boolean {
    if (!Number.isSafeInteger(n) || n <= 0 || this.count(id) < n) return false;
    this.inventory[id] -= n;
    if (this.inventory[id] === 0) delete this.inventory[id];
    return true;
  }

  plant(tx: number, ty: number, cropId: string): boolean {
    const seedId = `seed:${cropId}`;
    if (!this.canPlant(cropId) || this.count(seedId) < 1 || !this.field.plant(tx, ty, cropId)) return false;
    this.removeItem(seedId);
    this.ensureSeedSelected();
    return true;
  }

  harvest(tx: number, ty: number): string | null {
    const id = this.field.harvest(tx, ty);
    if (id) this.addItem(`crop:${id}`);
    return id;
  }

  isPropSpotFree(tx: number, ty: number): boolean {
    if (!isFree(tx, ty, this.buildings)) return false;
    const px = Math.floor(this.playerPosition.x / TILE_SIZE), py = Math.floor(this.playerPosition.y / TILE_SIZE);
    if (Math.abs(tx - px) <= 1 && Math.abs(ty - py) <= 1) return false;
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (this.field.get(x, y) || chestAt(this.chests, x, y)) return false;
    }
    return true;
  }

  chop(tx: number, ty: number, rand = Math.random): { hit: boolean; wood: number } {
    const p = findPropAt(this.props, tx, ty);
    if (p?.type !== 'tree' || this.energy < TOOL_COST.axe) return { hit: false, wood: 0 };
    const d = PROP_DEFS.tree;
    const hp = (p.hp ?? d.maxHp!) - 1;
    let wood = 0;
    if (hp === 0) {
      const drop = d.drop!;
      wood = drop.min + Math.floor(rand() * (drop.max - drop.min + 1));
      if (!this.addItem(drop.item, wood)) return { hit: false, wood: 0 };
      this.props = this.props.filter(item => item !== p);
    } else p.hp = hp;
    this.useEnergy(TOOL_COST.axe);
    return { hit: true, wood };
  }

  placeChest(tx: number, ty: number, type = 'wood_chest'): string | null {
    if (!Object.hasOwn(CHEST_DEFS, type) || this.count(`item:${type}`) < 1) return '상자가 없어요. 상점 제작 탭에서 만드세요.';
    const half = PLAYER_SIZE / 2;
    const overlapsPlayer = this.playerPosition.x + half > tx * TILE_SIZE && this.playerPosition.x - half < (tx + 1) * TILE_SIZE
      && this.playerPosition.y + half > ty * TILE_SIZE && this.playerPosition.y - half < (ty + 1) * TILE_SIZE;
    if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty) || tileAt(tx, ty) !== 0 || overlapsPlayer
      || isBuildingTile(this.buildings, tx, ty) || findPropAt(this.props, tx, ty)
      || this.field.get(tx, ty) || chestAt(this.chests, tx, ty)) return '여기에는 놓을 수 없어요. 빈 잔디에 놓으세요.';
    this.removeItem(`item:${type}`);
    this.chests.push({ type, tx, ty, items: {} });
    return null;
  }

  transferChest(chest: ChestInstance, id: string, deposit: boolean, n = 1): boolean {
    if (!this.chests.includes(chest) || !Number.isSafeInteger(n) || n <= 0) return false;
    const source = deposit ? this.inventory : chest.items;
    const target = deposit ? chest.items : this.inventory;
    if (!Object.hasOwn(source, id) || source[id] < n || !Number.isSafeInteger((target[id] ?? 0) + n)) return false;
    const capacity = CHEST_DEFS[chest.type].capacity;
    if (deposit && capacity !== null && !Object.hasOwn(target, id) && Object.keys(target).length >= capacity) return false;
    target[id] = (target[id] ?? 0) + n;
    source[id] -= n;
    if (source[id] === 0) delete source[id];
    this.ensureSeedSelected();
    return true;
  }

  hitChest(chest: ChestInstance): string | null {
    if (!this.chests.includes(chest)) return '상자가 없어요.';
    if (Object.keys(chest.items).length) return '상자를 먼저 비워 주세요.';
    if (!this.useEnergy(TOOL_COST.axe)) return '에너지가 부족해요.';
    chest.hp = (chest.hp ?? CHEST_DEFS[chest.type].hp) - 1;
    if (chest.hp === 0) this.chests = this.chests.filter(c => c !== chest);
    return null;
  }
}
