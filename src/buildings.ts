export interface BuildingDef {
  id: string;
  w: number;
  h: number;
  doorDx: number;
  doorDy: number;
  sprite: string;
}
export interface BuildingInstance { type: string; tx: number; ty: number }
export const BUILDING_DEFS: Record<string, BuildingDef> = {
  house: { id: 'house', w: 4, h: 3, doorDx: 1, doorDy: 2, sprite: 'house' },
};
export const INITIAL_BUILDINGS: BuildingInstance[] = [{ type: 'house', tx: 32, ty: 3 }];
export function isBuildingTile(buildings: BuildingInstance[], tx: number, ty: number) {
  return buildings.some(b => {
    const d = BUILDING_DEFS[b.type];
    return tx >= b.tx && tx < b.tx + d.w && ty >= b.ty && ty < b.ty + d.h;
  });
}
export function isDoorTile(buildings: BuildingInstance[], tx: number, ty: number) {
  return buildings.some(b => {
    const d = BUILDING_DEFS[b.type];
    return tx === b.tx + d.doorDx && ty === b.ty + d.doorDy;
  });
}
export function blocksBuilding(buildings: BuildingInstance[], tx: number, ty: number) {
  return isBuildingTile(buildings, tx, ty) && !isDoorTile(buildings, tx, ty);
}
export function isNearDoor(buildings: BuildingInstance[], tx: number, ty: number) {
  return buildings.some(b => {
    const d = BUILDING_DEFS[b.type];
    return Math.abs(tx - b.tx - d.doorDx) + Math.abs(ty - b.ty - d.doorDy) <= 1;
  });
}
