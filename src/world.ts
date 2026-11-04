export const TILE_SIZE = 32;
// Expand east and south while preserving existing field/save coordinates.
export const COLS = 50;
export const ROWS = 36;
export const PLAYER_SIZE = 24;
export const SPAWN = { x: 5.5 * TILE_SIZE, y: 8.5 * TILE_SIZE };

// 0: 잔디, 1: 물, 2: 벽, 3: 흙. 렌더링과 독립적인 게임 데이터입니다.
export type Tile = 0 | 1 | 2 | 3;
export const TILE_INFO = {
  0: { name: '잔디', color: 0x477744, blocked: false },
  1: { name: '물', color: 0x357fa3, blocked: true },
  2: { name: '벽', color: 0x68716f, blocked: true },
  3: { name: '흙', color: 0x9b714b, blocked: false },
} as const;

export const map: Tile[][] = Array.from({ length: ROWS }, (_, row) =>
  Array.from({ length: COLS }, (_, col): Tile => {
    if (row === 0 || row === ROWS - 1 || col === 0 || col === COLS - 1) return 2;
    if (col >= 16 && col <= 20 && row >= 3 && row <= 7) return 1;
    if (col === 12 && row >= 8 && row <= 13) return 2;
    if (col >= 4 && col <= 9 && row >= 4 && row <= 6) return 3;
    return 0;
  }),
);

export type Point = { x: number; y: number };
export type Facing = 'up' | 'down' | 'left' | 'right';
const OFFSETS: Record<Facing, Point> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export function worldToTile(position: Point) {
  return { col: Math.floor(position.x / TILE_SIZE), row: Math.floor(position.y / TILE_SIZE) };
}

export function frontTile(position: Point, facing: Facing) {
  const { col, row } = worldToTile(position);
  const offset = OFFSETS[facing];
  return { col: col + offset.x, row: row + offset.y };
}

export function tileAt(col: number, row: number): Tile | undefined {
  return map[row]?.[col];
}

// 중심점뿐 아니라 플레이어 사각형 전체가 겹치는 타일을 확인합니다.
export function canOccupy(position: Point, blockedAt: (col: number, row: number) => boolean = () => false): boolean {
  const half = PLAYER_SIZE / 2;
  const min = worldToTile({ x: position.x - half, y: position.y - half });
  const max = worldToTile({ x: position.x + half - 0.000001, y: position.y + half - 0.000001 });
  for (let row = min.row; row <= max.row; row++) {
    for (let col = min.col; col <= max.col; col++) {
      const tile = tileAt(col, row);
      if (tile === undefined || TILE_INFO[tile].blocked || blockedAt(col, row)) return false;
    }
  }
  return true;
}

export function moveWithCollision(position: Point, dx: number, dy: number, blockedAt: (col: number, row: number) => boolean = () => false): Point {
  const result = { ...position };
  // 큰 이동도 작게 나누어 낮은 FPS에서 벽을 뚫고 지나가지 않게 합니다.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  for (let step = 0; step < steps; step++) {
    const nextX = { x: result.x + dx / steps, y: result.y };
    if (canOccupy(nextX, blockedAt)) result.x = nextX.x;
    // 축을 따로 판정하면 벽에 비스듬히 접근해도 벽을 따라 이동합니다.
    const nextY = { x: result.x, y: result.y + dy / steps };
    if (canOccupy(nextY, blockedAt)) result.y = nextY.y;
  }
  return result;
}
