import { COLS, ROWS, SPAWN, TILE_SIZE, tileAt } from './world';
import { BUILDING_DEFS, INITIAL_BUILDINGS, type BuildingInstance } from './buildings';

export interface PropDef {
  id: string;
  w: number; h: number; // Collision footprint, independent of sprite dimensions.
  sprite: string;
  frameWidth: number; frameHeight: number;
  blocked: boolean;
  maxHp?: number;
  drop?: { item: string; min: number; max: number };
}
export interface PropInstance { type: string; tx: number; ty: number; hp?: number; age?: number }
export const MAX_TREES = 120;
export const SAPLING_GROW_DAYS = 4;
export const PROP_DEFS: Record<string, PropDef> = {
  tree: { id: 'tree', w: 1, h: 1, sprite: 'prop-tree', frameWidth: 32, frameHeight: 34, blocked: true, maxHp: 3, drop: { item: 'material:wood', min: 3, max: 5 } },
  sapling: { id: 'sapling', w: 1, h: 1, sprite: 'prop-tree', frameWidth: 32, frameHeight: 34, blocked: false },
};
export function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function isFree(tx: number, ty: number, buildings: BuildingInstance[] = INITIAL_BUILDINGS) {
  if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty) || tx < 2 || ty < 2 || tx >= COLS - 2 || ty >= ROWS - 2) return false;
  const sx = Math.floor(SPAWN.x / TILE_SIZE), sy = Math.floor(SPAWN.y / TILE_SIZE);
  if (Math.abs(tx - sx) <= 4 && Math.abs(ty - sy) <= 4) return false;
  // Preserve a generous starting farm and a route from it toward the house.
  if (tx >= 2 && tx <= 11 && ty >= 2 && ty <= 13) return false;
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
    if (tileAt(x, y) !== 0) return false;
  }
  return !buildings.some(b => {
    const d = BUILDING_DEFS[b.type];
    const doorX = b.tx + d.doorDx, doorY = b.ty + d.doorDy;
    return (tx >= b.tx - 2 && tx <= b.tx + d.w + 1 && ty >= b.ty - 2 && ty <= b.ty + d.h + 1)
      || (Math.abs(tx - doorX) <= 2 && ty >= doorY && ty <= doorY + 3);
  });
}
export function createInitialProps(buildings = INITIAL_BUILDINGS): PropInstance[] {
  const random = mulberry32(20261024);
  const props: PropInstance[] = [];
  for (let ty = 2; ty < ROWS - 2; ty++) for (let tx = 2; tx < COLS - 2; tx++) {
    const edge = tx <= 3 || ty <= 3 || tx >= COLS - 4 || ty >= ROWS - 4;
    if (edge && isFree(tx, ty, buildings) && random() < 0.65) props.push({ type: 'tree', tx, ty });
  }
  // Sample across all four edges instead of filling only the first rows.
  for (let i = props.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [props[i], props[j]] = [props[j], props[i]];
  }
  return props.slice(0, MAX_TREES);
}
export function findPropAt(props: PropInstance[], tx: number, ty: number) {
  return props.find(p => {
    const d = PROP_DEFS[p.type];
    return tx >= p.tx && tx < p.tx + d.w && ty >= p.ty && ty < p.ty + d.h;
  });
}
export function advancePropsOneDay(props: PropInstance[], free: (x: number, y: number) => boolean, rand = Math.random) {
  for (const p of props) {
    if (p.type !== 'sapling') continue;
    p.age = Math.min(SAPLING_GROW_DAYS, (p.age ?? 0) + 1);
    if (p.age >= SAPLING_GROW_DAYS && free(p.tx, p.ty)) {
      p.type = 'tree'; delete p.age; delete p.hp;
    }
  }
  for (let i = 0; i < 2 && props.length < MAX_TREES; i++) {
    if (rand() >= 0.4) continue;
    const tx = Math.floor(rand() * (COLS - 2)) + 1;
    const ty = Math.floor(rand() * (ROWS - 2)) + 1;
    if (free(tx, ty) && !findPropAt(props, tx, ty)) props.push({ type: 'sapling', tx, ty, age: 0 });
  }
}
export function isPropTile(props: PropInstance[], tx: number, ty: number) {
  return props.some(p => {
    const d = PROP_DEFS[p.type];
    return d.blocked && tx >= p.tx && tx < p.tx + d.w && ty >= p.ty && ty < p.ty + d.h;
  });
}
export function loadProps(value: unknown, buildings: BuildingInstance[]): PropInstance[] {
  if (!Array.isArray(value)) throw new Error('장식 데이터 오류');
  const seen = new Set<string>();
  return value.map(p => {
    if (!p || typeof p.type !== 'string' || !Object.hasOwn(PROP_DEFS, p.type)
      || !isFree(p.tx, p.ty, buildings)) throw new Error('장식 종류·좌표 오류');
    const key = `${p.tx},${p.ty}`;
    if (seen.has(key)) throw new Error('중복 장식');
    seen.add(key);
    const result: PropInstance = { type: p.type, tx: p.tx, ty: p.ty };
    if (p.type === 'tree') {
      if (p.age !== undefined || (p.hp !== undefined && (!Number.isSafeInteger(p.hp) || p.hp < 1 || p.hp > PROP_DEFS.tree.maxHp!))) throw new Error('나무 체력 오류');
      if (p.hp !== undefined) result.hp = p.hp;
    } else {
      if (p.hp !== undefined || (p.age !== undefined && (!Number.isSafeInteger(p.age) || p.age < 0 || p.age > SAPLING_GROW_DAYS))) throw new Error('묘목 나이 오류');
      result.age = p.age ?? 0;
    }
    return result;
  });
}
