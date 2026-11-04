import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

// 게임 엔진이나 브라우저 없이 실제 월드 로직을 실행합니다.
const source = readFileSync(new URL('../src/world.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const world = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const { map, COLS, ROWS, SPAWN, canOccupy, worldToTile, frontTile, moveWithCollision } = world;

test('맵 크기와 네 종류의 타일, 시작 위치', () => {
  assert.equal(map.length, ROWS);
  assert.ok(map.every(row => row.length === COLS));
  assert.deepEqual([...new Set(map.flat())].sort(), [0, 1, 2, 3]);
  assert.ok(canOccupy(SPAWN));
});

test('타일 경계와 네 방향의 앞 타일', () => {
  assert.deepEqual(worldToTile({ x: 31.9, y: 32 }), { col: 0, row: 1 });
  assert.deepEqual(worldToTile({ x: -1, y: 0 }), { col: -1, row: 0 });
  for (const [facing, col, row] of [['up', 5, 7], ['down', 5, 9], ['left', 4, 8], ['right', 6, 8]]) {
    assert.deepEqual(frontTile(SPAWN, facing), { col, row });
  }
});

test('잔디와 흙은 통과하고 물·벽·맵 밖은 차단', () => {
  assert.ok(canOccupy({ x: 176, y: 176 }));
  assert.ok(canOccupy(SPAWN));
  assert.equal(canOccupy({ x: 528, y: 112 }), false);
  assert.equal(canOccupy({ x: 400, y: 272 }), false);
  assert.equal(canOccupy({ x: -50, y: 200 }), false);
  assert.equal(canOccupy({ x: 200, y: ROWS * 32 + 4 }), false);
  // 중심은 잔디라도 오른쪽 가장자리가 물과 겹치면 차단됩니다.
  assert.equal(canOccupy({ x: 505, y: 144 }), false);
  assert.ok(canOccupy({ x: 500, y: 144 }));
});

test('큰 이동도 벽과 물을 뚫지 않음', () => {
  const wall = moveWithCollision(SPAWN, 600, 0);
  assert.ok(wall.x <= 372 && wall.x >= 368);
  assert.ok(canOccupy(wall));
  const water = moveWithCollision({ x: 464, y: 144 }, 300, 0);
  assert.ok(water.x <= 500 && water.x >= 496);
  assert.ok(canOccupy(water));
});

test('벽을 향한 대각선 입력은 벽을 따라 이동', () => {
  const next = moveWithCollision({ x: 372, y: 300 }, 20, 20);
  assert.equal(next.x, 372);
  assert.equal(next.y, 320);
  assert.ok(canOccupy(next));
});

test('확장 지역은 이전 경계 너머로 연결되고 새 외곽은 막힘', () => {
  assert.equal(COLS, 50);
  assert.equal(ROWS, 36);
  const east = moveWithCollision({ x: 23.5 * 32, y: 10.5 * 32 }, 4 * 32, 0);
  assert.equal(east.x, 27.5 * 32);
  const south = moveWithCollision({ x: 5.5 * 32, y: 16.5 * 32 }, 0, 4 * 32);
  assert.equal(south.y, 20.5 * 32);
  assert.ok(map[0].every(tile => tile === 2));
  assert.ok(map[ROWS - 1].every(tile => tile === 2));
  assert.ok(map.every(row => row[0] === 2 && row[COLS - 1] === 2));
  assert.equal(canOccupy({ x: (COLS - 0.5) * 32, y: 20.5 * 32 }), false);
  assert.equal(canOccupy({ x: 30.5 * 32, y: (ROWS - 0.5) * 32 }), false);
});
