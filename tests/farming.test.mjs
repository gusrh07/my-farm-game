import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

function moduleUrl(file, replacements = {}) {
  let source = readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const cropsUrl = moduleUrl('../src/crops.ts');
const { CROPS } = await import(cropsUrl);
const { FarmField } = await import(moduleUrl('../src/farming.ts', { "'./crops'": JSON.stringify(cropsUrl) }));

test('경작 전 심기·물 주기 불가, 중복 심기와 잘못된 작물 차단', () => {
  const field = new FarmField();
  assert.equal(field.plant(1, 1, 'turnip'), false);
  assert.equal(field.water(1, 1), false);
  assert.equal(field.till(1, 1, false), false);
  assert.equal(field.till(1, 1, true), true);
  assert.equal(field.plant(1, 1, 'unknown'), false);
  assert.equal(field.plant(1, 1, 'toString'), false);
  assert.equal(field.plant(1, 1, 'turnip'), true);
  assert.equal(field.plant(1, 1, 'potato'), false);
});

for (const def of Object.values(CROPS)) {
  test(`${def.name}: 물 준 날만 성장하고 성숙 후 수확·재파종`, () => {
    const field = new FarmField();
    field.till(2, 3, true);
    field.plant(2, 3, def.id);
    field.advanceDay();
    assert.equal(field.get(2, 3).crop.daysGrown, 0);
    assert.equal(field.harvest(2, 3), null);
    for (let day = 1; day <= def.growDays; day++) {
      assert.equal(field.water(2, 3), true);
      assert.equal(field.water(2, 3), false);
      field.advanceDay();
      assert.equal(field.get(2, 3).watered, false);
      assert.equal(field.get(2, 3).crop.daysGrown, day);
      assert.equal(field.isRipe(2, 3), day === def.growDays);
    }
    field.water(2, 3);
    field.advanceDay();
    assert.equal(field.get(2, 3).crop.daysGrown, def.growDays);
    assert.equal(field.harvest(2, 3), def.id);
    assert.equal(field.harvest(2, 3), null);
    assert.equal(field.get(2, 3).tilled, true);
    assert.equal(field.plant(2, 3, def.id), true);
  });
}

test('하루 경과는 모든 밭을 갱신하고 빈 밭의 물도 초기화', () => {
  const field = new FarmField();
  for (let col = 0; col < 3; col++) field.till(col, 0, true);
  field.plant(0, 0, 'turnip');
  field.plant(1, 0, 'potato');
  field.water(0, 0);
  field.water(2, 0);
  field.advanceDay();
  assert.equal(field.get(0, 0).crop.daysGrown, 1);
  assert.equal(field.get(1, 0).crop.daysGrown, 0);
  assert.ok(field.entries().every(([, soil]) => !soil.watered));
});

test('직렬화 스냅샷의 작물 변경은 실제 경작 상태에 영향 없음', () => {
  const field = new FarmField();
  field.till(4, 5, true);
  field.plant(4, 5, 'turnip');
  const snapshot = field.toJSON();
  assert.deepEqual(JSON.parse(JSON.stringify(field)), snapshot);
  snapshot[0][1].crop.daysGrown = 99;
  assert.equal(field.get(4, 5).crop.daysGrown, 0);
});
