import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const urls = {};
for (const name of ['lighting', 'crops', 'fish', 'chests', 'items', 'recipes', 'world', 'buildings', 'props', 'farming', 'state', 'shop', 'save']) {
  let source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
  for (const [dependency, url] of Object.entries(urls)) source = source.replaceAll(`'./${dependency}'`, JSON.stringify(url));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  urls[name] = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const { GameState } = await import(urls.state);
const { buySeed, sellAllCrops, sellOneCrop } = await import(urls.shop);
const { CROPS } = await import(urls.crops);

// Recreate the old flat v1 format for existing migration/error tests.
function legacySave(serialized) {
  const { maps, currentMap, ...data } = JSON.parse(serialized);
  return { ...data, version: 1, ...maps.farm };
}

test('시간대 조명 키프레임·보간·범위 제한', async () => {
  const { lightAt, LIGHT_KEYS } = await import(urls.lighting);
  for (const key of LIGHT_KEYS) {
    assert.equal(lightAt(key.minutes).color, key.color);
    assert.ok(Math.abs(lightAt(key.minutes).alpha - key.alpha) < 1e-10);
  }
  assert.equal(lightAt(1020).color, 0xffcda6);
  assert.equal(lightAt(1020).alpha, 0.09);
  assert.equal(lightAt(0).alpha, 0.12);
  assert.equal(lightAt(2000).alpha, 0.5);
});

test('조명용 연속 시각은 저장·취침 시 재설정, 독립 타이머 없음', () => {
  const state = new GameState();
  state.advanceTime(3500);
  assert.equal(state.minutes, 360);
  assert.equal(state.lightingMinutes, 365);
  const saved = state.serialize();
  state.advanceTime(3500);
  assert.equal(state.lightingMinutes, 370);
  state.load(saved);
  assert.equal(state.lightingMinutes, 360);
  state.advanceTime(3500);
  state.sleep();
  assert.equal(state.lightingMinutes, 360);
});

for (const [id, day, cost, price] of [['corn', 29, 40, 90], ['pumpkin', 57, 60, 140]]) {
  test(`${id}: 구매·씨앗 선택·계절 파종·성장·저장·수확·판매`, () => {
    const state = new GameState();
    state.removeItem('seed:turnip', 5);
    assert.equal(buySeed(state, id), true);
    assert.equal(state.selectedSeed, id);
    assert.equal(state.gold, 100 - cost);
    state.till(1, 2);
    assert.equal(state.plant(1, 2, id), false);
    assert.equal(state.count(`seed:${id}`), 1);
    state.day = day;
    assert.equal(state.plant(1, 2, id), true);
    for (let i = 0; i < CROPS[id].growDays; i++) {
      state.water(1, 2);
      state.sleep();
    }
    const restored = new GameState();
    restored.load(state.serialize());
    assert.equal(restored.harvest(1, 2), id);
    assert.equal(sellOneCrop(restored, id), price);
    assert.equal(restored.gold, 100 - cost + price);
  });
}

test('28일 계절 경계와 연간 순환', () => {
  const state = new GameState();
  for (const [day, season, dayOfSeason] of [[1, 'spring', 1], [28, 'spring', 28], [29, 'summer', 1], [56, 'summer', 28], [57, 'fall', 1], [85, 'winter', 1], [112, 'winter', 28], [113, 'spring', 1]]) {
    state.day = day;
    assert.equal(state.season, season);
    assert.equal(state.dayOfSeason, dayOfSeason);
  }
});

test('계절에 맞지 않는 파종은 씨앗·밭을 보존, 계절 변경 시 기존 작물 제거', () => {
  const state = new GameState();
  state.field.till(1, 2, true);
  state.addItem('seed:potato', 2);
  state.day = 29;
  const before = state.serialize();
  assert.equal(state.plant(1, 2, 'turnip'), false);
  assert.equal(state.plant(1, 2, 'potato'), false);
  assert.equal(state.serialize(), before);
  state.day = 57;
  assert.equal(state.canPlant('turnip'), true);
  assert.equal(state.canPlant('potato'), false);
  assert.equal(state.canPlant('unknown'), false);
  state.day = 28;
  state.plant(1, 2, 'potato');
  state.water(1, 2);
  state.sleep();
  assert.equal(state.field.get(1, 2).crop, undefined);
  assert.equal(state.field.get(1, 2).tilled, true);
  assert.equal(state.lastWitheredCount, 1);
});

for (const automatic of [false, true]) {
  test(`계절 변경: 성숙·성장 중 작물 제거, 땅·재고 보존 (${automatic ? '자정' : '수동'})`, () => {
    const state = new GameState();
    state.day = 28;
    state.field.load([
      ['1,2', { tilled: true, watered: true, crop: { id: 'turnip', daysGrown: 1 } }],
      ['2,2', { tilled: true, watered: true, crop: { id: 'potato', daysGrown: 0 } }],
    ]);
    const inventory = { ...state.inventory };
    if (automatic) {
      state.minutes = 1430;
      assert.equal(state.advanceTime(7000), true);
    } else state.sleep();
    assert.equal(state.day, 29);
    assert.equal(state.lastWitheredCount, 2);
    assert.equal(state.harvest(1, 2), null);
    for (const [, soil] of state.field.entries()) {
      assert.equal(soil.crop, undefined);
      assert.equal(soil.tilled, true);
    }
    assert.deepEqual(state.inventory, inventory);
    const restored = new GameState();
    restored.load(state.serialize());
    assert.deepEqual(restored.field.entries(), state.field.entries());
    state.sleep();
    assert.equal(state.lastWitheredCount, 0);
  });
}

test('계절 안에서는 성숙 작물을 유지하고 겨울에서 봄으로도 날짜가 순환', () => {
  const state = new GameState();
  state.day = 27;
  state.field.load([['1,2', { tilled: true, watered: false, crop: { id: 'turnip', daysGrown: 1 } }]]);
  state.sleep();
  assert.equal(state.field.isRipe(1, 2), true);
  state.day = 112;
  state.sleep();
  assert.equal(state.season, 'spring');
  assert.equal(state.field.isRipe(1, 2), true);
});

test('오늘의 비로 성장, 내일의 비는 다음 아침부터 적용, 새 밭도 즉시 젖음', () => {
  const state = new GameState();
  state.rollWeather = () => 'sunny';
  state.till(1, 2);
  state.plant(1, 2, 'turnip');
  state.tomorrowWeather = 'rain';
  state.sleep();
  assert.equal(state.weather, 'rain');
  assert.equal(state.field.get(1, 2).crop.daysGrown, 0);
  assert.equal(state.field.get(1, 2).watered, true);
  assert.equal(state.till(2, 2), true);
  assert.equal(state.field.get(2, 2).watered, true);
  const energy = state.energy;
  assert.equal(state.water(2, 2), false);
  assert.equal(state.energy, energy);
  state.sleep();
  assert.equal(state.weather, 'sunny');
  assert.equal(state.field.get(1, 2).crop.daysGrown, 1);
  assert.equal(state.field.get(1, 2).watered, false);
});

test('오늘·내일 날씨 저장 유지, 로드는 추첨하지 않음, 구버전은 맑음', () => {
  const state = new GameState();
  state.weather = 'rain';
  state.tomorrowWeather = 'rain';
  state.till(1, 2);
  const saved = state.serialize();
  const restored = new GameState();
  restored.rollWeather = () => { throw new Error('로드 중 추첨 금지'); };
  restored.load(saved);
  restored.load(saved);
  assert.equal(restored.serialize(), saved);
  const legacy = legacySave(saved);
  delete legacy.weather;
  delete legacy.tomorrowWeather;
  restored.load(JSON.stringify(legacy));
  assert.equal(restored.weather, 'sunny');
  assert.equal(restored.tomorrowWeather, 'sunny');
  const before = restored.serialize();
  assert.throws(() => restored.load(JSON.stringify({ ...legacy, weather: 'snow' })));
  assert.equal(restored.serialize(), before);
});

test('성공한 호미질·물 주기만 에너지 차감, 실패는 보존', () => {
  const state = new GameState();
  assert.equal(state.energy, 100);
  assert.equal(state.till(0, 0), false);
  assert.equal(state.water(1, 2), false);
  assert.equal(state.energy, 100);
  assert.equal(state.till(1, 2), true);
  assert.equal(state.energy, 98);
  assert.equal(state.till(1, 2), false);
  assert.equal(state.water(1, 2), true);
  assert.equal(state.energy, 97);
  assert.equal(state.water(1, 2), false);
  assert.equal(state.energy, 97);
});

test('에너지 부족 시 밭 변경 없음, 0에서도 심기·수확 가능, 기절 없음', () => {
  const state = new GameState();
  state.till(1, 2);
  state.energy = 1;
  assert.equal(state.till(2, 2), false);
  assert.equal(state.field.get(2, 2), undefined);
  assert.equal(state.water(1, 2), true);
  assert.equal(state.energy, 0);
  assert.equal(state.day, 1);
  assert.equal(state.water(2, 2), false);
  assert.equal(state.plant(1, 2, 'turnip'), true);
  state.field.advanceDay();
  assert.equal(state.harvest(1, 2), 'turnip');
  assert.equal(state.energy, 0);
  assert.equal(state.day, 1);
  assert.equal(state.useEnergy(-1), false);
  assert.equal(state.useEnergy(1), false);
});

test('수동·자정 취침 회복, 저장 복원·구버전 기본값·손상 에너지 거부', () => {
  const state = new GameState();
  state.energy = 0;
  const saved = state.serialize();
  state.sleep();
  assert.equal(state.energy, 100);
  state.load(saved);
  assert.equal(state.energy, 0);
  state.minutes = 1430;
  state.advanceTime(7000);
  assert.equal(state.energy, 70);
  const forcedSave = state.serialize();
  const restored = new GameState();
  restored.load(forcedSave);
  assert.equal(restored.energy, 70);
  assert.equal(restored.minutes, 360);
  const legacy = legacySave(saved);
  delete legacy.energy;
  state.load(JSON.stringify(legacy));
  assert.equal(state.energy, 100);
  const before = state.serialize();
  for (const energy of [-1, 101, 1.5, null, '50']) {
    assert.throws(() => state.load(JSON.stringify({ ...legacy, energy })));
    assert.equal(state.serialize(), before);
  }
});

test('06:00 시작, 7초당 10분, 자정에 한 번 성장하고 다음 날 06:00', () => {
  const state = new GameState();
  assert.equal(state.timeLabel, '06:00');
  state.advanceTime(6999);
  assert.equal(state.timeLabel, '06:00');
  state.advanceTime(1);
  assert.equal(state.timeLabel, '06:10');
  state.advanceTime(14000);
  assert.equal(state.timeLabel, '06:30');
  state.field.till(1, 2, true);
  state.plant(1, 2, 'turnip');
  state.field.water(1, 2);
  state.minutes = 1430;
  assert.equal(state.timeLabel, '23:50');
  assert.equal(state.advanceTime(7000), true);
  assert.equal(state.day, 2);
  assert.equal(state.timeLabel, '06:00');
  assert.equal(state.field.isRipe(1, 2), true);
  assert.equal(state.field.get(1, 2).watered, false);
});

test('로드와 수동 취침은 이전 프레임 누적 시간을 초기화', () => {
  const state = new GameState();
  state.minutes = 900;
  const saved = state.serialize();
  state.advanceTime(6999);
  state.load(saved);
  state.advanceTime(1);
  assert.equal(state.minutes, 900);
  state.advanceTime(6999);
  assert.equal(state.minutes, 910);
  state.advanceTime(6999);
  state.sleep();
  state.advanceTime(1);
  assert.equal(state.timeLabel, '06:00');
  assert.equal(state.day, 2);
});

test('기존 60초 하루 저장은 자원과 밭을 유지하고 06:00에 재개', () => {
  const state = new GameState();
  const legacy = legacySave(state.serialize());
  delete legacy.minutes;
  legacy.dayElapsedMs = 45000;
  legacy.day = 5;
  legacy.gold = 230;
  state.load(JSON.stringify(legacy));
  assert.equal(state.day, 5);
  assert.equal(state.gold, 230);
  assert.equal(state.timeLabel, '06:00');
});

test('저장·복원 후 날짜·돈·타이머·선택·밭 일치 및 성장 계속', () => {
  const original = new GameState();
  original.day = 7;
  original.gold = 245;
  original.minutes = 850;
  original.addItem('seed:potato', 2);
  original.selectedSeed = 'potato';
  original.field.till(1, 2, true);
  original.plant(1, 2, 'potato');
  original.field.water(1, 2);
  const restored = new GameState();
  restored.field.till(2, 2, true);
  restored.load(original.serialize());
  assert.equal(restored.serialize(), original.serialize());
  assert.equal(restored.field.get(2, 2), undefined);
  restored.field.advanceDay();
  assert.equal(restored.field.get(1, 2).crop.daysGrown, 1);
  assert.equal(restored.field.get(1, 2).watered, false);
  assert.equal(original.field.get(1, 2).crop.daysGrown, 0);
});

test('보유하지 않은 선택 씨앗은 로드 끝에서 보정', () => {
  const state = new GameState();
  const saved = JSON.parse(state.serialize());
  saved.inventory = { 'seed:potato': 2 };
  state.load(JSON.stringify(saved));
  assert.equal(state.selectedSeed, 'potato');
  saved.inventory = {};
  state.load(JSON.stringify(saved));
  assert.equal(state.selectedSeed, 'turnip');
});

test('손상된 저장 데이터는 현재 상태를 일부라도 덮어쓰지 않음', () => {
  const state = new GameState();
  state.field.till(1, 2, true);
  const before = state.serialize();
  const changes = [
    { version: 2 }, { day: 0 }, { gold: -1 }, { minutes: 1440 }, { minutes: 350 }, { minutes: 361 },
    { selectedSeed: 'unknown' }, { inventory: { 'seed:turnip': -1 } },
    { field: [['0,0', { tilled: true, watered: false }]] },
    { field: [['1,2', { tilled: true, watered: false, crop: { id: 'unknown', daysGrown: 0 } }]] },
    { field: [['1,2', { tilled: true, watered: 'yes' }]] },
    { field: [['1,2', { tilled: true, watered: false }], ['1,2', { tilled: true, watered: false }]] },
  ];
  for (const change of changes) {
    assert.throws(() => state.load(JSON.stringify({ ...legacySave(before), ...change })));
    assert.equal(state.serialize(), before);
  }
  assert.throws(() => state.load('{invalid'));
  assert.equal(state.serialize(), before);
});

test('FarmField.load는 입력을 복사하고 실패하면 기존 밭 유지', () => {
  const state = new GameState();
  const entries = [['1,2', { tilled: true, watered: true, crop: { id: 'potato', daysGrown: 2 } }]];
  state.field.load(entries);
  entries[0][1].crop.daysGrown = 4;
  assert.equal(state.field.get(1, 2).crop.daysGrown, 2);
  const before = state.field.toJSON();
  assert.throws(() => state.field.load([['2,2', { tilled: true, watered: false }], ['invalid', {}]]));
  assert.deepEqual(state.field.toJSON(), before);
});

test('마지막 씨앗 심기 성공 시에만 보유 씨앗으로 전환', () => {
  const state = new GameState();
  state.removeItem('seed:turnip', 4);
  state.addItem('seed:potato', 2);
  assert.equal(state.plant(1, 1, 'turnip'), false);
  assert.equal(state.selectedSeed, 'turnip');
  state.field.till(1, 1, true);
  assert.equal(state.plant(1, 1, 'turnip'), true);
  assert.equal(state.field.get(1, 1).crop.id, 'turnip');
  assert.equal(state.count('seed:turnip'), 0);
  assert.equal(state.selectedSeed, 'potato');
  assert.equal(state.count('seed:potato'), 2);
});

test('씨앗 전환은 보유 종류만 순환하고 전부 소진되면 선택 유지', () => {
  const state = new GameState();
  state.cycleSeed();
  assert.equal(state.selectedSeed, 'turnip');
  state.addItem('seed:potato');
  state.cycleSeed();
  assert.equal(state.selectedSeed, 'potato');
  state.ensureSeedSelected();
  assert.equal(state.selectedSeed, 'potato');
  state.cycleSeed();
  assert.equal(state.selectedSeed, 'turnip');
  state.removeItem('seed:turnip', 5);
  state.removeItem('seed:potato');
  state.ensureSeedSelected();
  state.cycleSeed();
  assert.equal(state.selectedSeed, 'turnip');
  assert.equal(state.count(`seed:${state.selectedSeed}`), 0);
  buySeed(state, 'potato');
  assert.equal(state.selectedSeed, 'potato');
});

test('심기 실패는 씨앗을 소비하지 않고 성공 시에만 한 개 소비', () => {
  const state = new GameState();
  assert.equal(state.gold, 100);
  assert.equal(state.count('seed:turnip'), 5);
  assert.equal(state.plant(1, 1, 'turnip'), false);
  assert.equal(state.count('seed:turnip'), 5);
  state.field.till(1, 1, true);
  assert.equal(state.plant(1, 1, 'turnip'), true);
  assert.equal(state.plant(1, 1, 'turnip'), false);
  assert.equal(state.count('seed:turnip'), 4);
  state.removeItem('seed:turnip', 4);
  state.field.till(2, 1, true);
  assert.equal(state.plant(2, 1, 'turnip'), false);
  assert.equal(state.field.get(2, 1).crop, undefined);
});

test('순무 한 개 판매는 다른 수확물·씨앗을 보존하고 재고 없으면 변경 없음', () => {
  const state = new GameState();
  state.addItem('crop:turnip', 2);
  state.addItem('crop:potato', 3);
  assert.equal(sellOneCrop(state, 'turnip'), 40);
  assert.equal(state.count('crop:turnip'), 1);
  assert.equal(state.gold, 140);
  assert.equal(state.count('crop:potato'), 3);
  assert.equal(state.count('seed:turnip'), 5);
  assert.equal(sellOneCrop(state, 'turnip'), 40);
  const before = JSON.stringify(state);
  assert.equal(sellOneCrop(state, 'turnip'), 0);
  assert.equal(sellOneCrop(state, 'unknown'), 0);
  assert.equal(sellOneCrop(state, 'toString'), 0);
  assert.equal(JSON.stringify(state), before);
});

test('성장 → 수확 → 판매 → 재구매 전체 루프', () => {
  const state = new GameState();
  state.field.till(1, 1, true);
  state.plant(1, 1, 'turnip');
  assert.equal(state.harvest(1, 1), null);
  for (let i = 0; i < CROPS.turnip.growDays; i++) {
    state.field.water(1, 1);
    state.field.advanceDay();
  }
  assert.equal(state.harvest(1, 1), 'turnip');
  assert.equal(state.harvest(1, 1), null);
  assert.equal(state.count('crop:turnip'), 1);
  assert.equal(sellOneCrop(state, 'turnip'), 40);
  assert.equal(state.gold, 140);
  assert.equal(state.count('crop:turnip'), 0);
  assert.equal(sellOneCrop(state, 'turnip'), 0);
  assert.equal(buySeed(state, 'turnip'), true);
  assert.equal(state.gold, 120);
  assert.equal(state.count('seed:turnip'), 5);
});

test('돈 부족·잘못된 수량·알 수 없는 작물은 거래 거절', () => {
  const state = new GameState();
  const before = JSON.stringify(state);
  for (const n of [-1, 0, 0.5, NaN, Infinity, 6]) assert.equal(buySeed(state, 'turnip', n), false);
  assert.equal(buySeed(state, 'toString'), false);
  assert.equal(buySeed(state, 'unknown'), false);
  assert.equal(state.removeItem('seed:turnip', -1), false);
  assert.equal(state.addItem('seed:turnip', -1), false);
  assert.equal(JSON.stringify(state), before);
  assert.equal(buySeed(state, 'turnip', 5), true);
  assert.equal(state.gold, 0);
  assert.equal(buySeed(state, 'turnip'), false);
});

test('모든 수확물 판매는 씨앗과 알 수 없는 아이템을 보존', () => {
  const state = new GameState();
  state.addItem('crop:turnip', 2);
  state.addItem('crop:potato', 3);
  state.addItem('crop:unknown');
  assert.equal(sellAllCrops(state), 320);
  assert.equal(state.count('seed:turnip'), 5);
  assert.equal(state.count('crop:unknown'), 1);
});

test('GameState 직렬화에는 날짜·타이머·돈·인벤토리·밭이 포함', () => {
  const state = new GameState();
  state.field.till(1, 2, true);
  state.plant(1, 2, 'turnip');
  state.minutes = 720;
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(saved.day, 1);
  assert.equal(saved.minutes, 720);
  assert.equal(saved.gold, 100);
  assert.equal(saved.inventory['seed:turnip'], 4);
  assert.equal(saved.maps.farm.field[0][1].crop.id, 'turnip');
});

test('집 벽은 차단, 문은 통과 가능하며 건물 전체는 경작 불가', async () => {
  const { blocksBuilding } = await import(urls.buildings);
  const { canOccupy, moveWithCollision } = await import(urls.world);
  const state = new GameState();
  const blocked = (x, y) => blocksBuilding(state.buildings, x, y);
  assert.equal(canOccupy({ x: 32.5 * 32, y: 4.5 * 32 }, blocked), false);
  assert.equal(canOccupy({ x: 33.5 * 32, y: 5.5 * 32 }, blocked), true);
  const door = moveWithCollision({ x: 33.5 * 32, y: 6.5 * 32 }, 0, -32, blocked);
  assert.equal(door.y, 5.5 * 32);
  const wall = moveWithCollision(door, 0, -96, blocked);
  assert.ok(wall.y >= 5 * 32 + 12);
  assert.equal(state.till(32, 4), false);
  assert.equal(state.till(33, 5), false);
  assert.equal(state.energy, 100);
  assert.equal(state.till(33, 6), true);
});

test('집 상호작용은 문과 상하좌우 한 칸만 허용', async () => {
  const { isNearDoor, INITIAL_BUILDINGS } = await import(urls.buildings);
  for (const [x, y] of [[33, 5], [33, 4], [33, 6], [32, 5], [34, 5]]) {
    assert.equal(isNearDoor(INITIAL_BUILDINGS, x, y), true);
  }
  for (const [x, y] of [[32, 6], [34, 6], [33, 7], [5, 8]]) {
    assert.equal(isNearDoor(INITIAL_BUILDINGS, x, y), false);
  }
});

test('개발용 1시간 이동은 날짜를 유지하고 자정 도달 시 강제 취침', () => {
  const state = new GameState();
  state.advanceTime(3500);
  assert.equal(state.advanceTime(7000 * 6), false);
  assert.equal(state.minutes, 420);
  assert.equal(state.day, 1);
  assert.equal(state.lightingMinutes, 425);
  state.minutes = 1410;
  assert.equal(state.advanceTime(7000 * 6), true);
  assert.equal(state.day, 2);
  assert.equal(state.minutes, 360);
  assert.equal(state.lightingMinutes, 360);
  assert.equal(state.energy, 70);
});

test('나무는 고정 배치되고 금지 구역을 피하며 충돌·경작 제한 적용', async () => {
  const { createInitialProps, isFree, isPropTile } = await import(urls.props);
  const { canOccupy } = await import(urls.world);
  const state = new GameState();
  assert.ok(state.props.length > 0);
  assert.deepEqual(state.props, createInitialProps());
  for (const p of state.props) {
    assert.ok(isFree(p.tx, p.ty));
    assert.ok(p.tx <= 3 || p.ty <= 3 || p.tx >= 46 || p.ty >= 32);
  }
  const p = state.props[0];
  assert.equal(canOccupy({ x: (p.tx + 0.5) * 32, y: (p.ty + 0.5) * 32 }, (x, y) => isPropTile(state.props, x, y)), false);
  assert.equal(state.till(p.tx, p.ty), false);
  assert.equal(state.energy, 100);
  // A walkable route still connects the spawn to the house doorstep.
  const { tileAt } = await import(urls.world);
  const { blocksBuilding } = await import(urls.buildings);
  const queue = [[5, 8]], visited = new Set(['5,8']);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      const tile = tileAt(nx, ny), key = `${nx},${ny}`;
      if (visited.has(key) || (tile !== 0 && tile !== 3) || blocksBuilding(state.buildings,nx,ny) || isPropTile(state.props,nx,ny)) continue;
      visited.add(key); queue.push([nx,ny]);
    }
  }
  assert.ok(visited.has('33,6'));
});

test('나무 저장 복원, 옛 저장의 밭 보호, 손상된 나무 로드 거부', () => {
  const state = new GameState();
  const p = state.props[0];
  const saved = state.serialize();
  state.props = [];
  state.load(saved);
  assert.deepEqual(state.props, JSON.parse(saved).maps.farm.props);
  const legacy = legacySave(saved);
  delete legacy.props;
  legacy.field.push([`${p.tx},${p.ty}`, { tilled: true, watered: false }]);
  state.load(JSON.stringify(legacy));
  assert.ok(state.field.get(p.tx,p.ty));
  assert.equal(state.props.some(q => q.tx === p.tx && q.ty === p.ty), false);
  const before = state.serialize();
  for (const props of [null, [{ type: 'unknown', tx: 2, ty: 2 }], [{ type: 'tree', tx: 5, ty: 8 }], [p,p]]) {
    assert.throws(() => state.load(JSON.stringify({ ...legacySave(saved), props })));
    assert.equal(state.serialize(), before);
  }
});


test('도끼 3회·체력 저장·목재 판매·베어진 자리 경작', async () => {
  const state = new GameState();
  const p = state.props[0];
  assert.deepEqual(state.chop(5,8), {hit:false,wood:0});
  assert.equal(state.energy,100);
  assert.deepEqual(state.chop(p.tx,p.ty), {hit:true,wood:0});
  assert.equal(p.hp,2);
  const restored = new GameState(); restored.load(state.serialize());
  assert.equal(restored.props.find(q=>q.tx===p.tx&&q.ty===p.ty).hp,2);
  restored.energy=3;
  assert.equal(restored.chop(p.tx,p.ty).hit,false);
  restored.energy=96;
  restored.chop(p.tx,p.ty);
  assert.deepEqual(restored.chop(p.tx,p.ty,()=>0.99),{hit:true,wood:5});
  assert.equal(restored.energy,88);
  assert.equal(restored.count('material:wood'),5);
  assert.equal(restored.props.some(q=>q.tx===p.tx&&q.ty===p.ty),false);
  state.load(restored.serialize());
  assert.equal(state.props.some(q=>q.tx===p.tx&&q.ty===p.ty),false);
  assert.equal(state.till(p.tx,p.ty),true);
  const {sellOneMaterial}=await import(urls.shop);
  assert.equal(sellOneMaterial(state,'material:wood'),10);
  assert.equal(state.count('material:wood'),4);
  state.load(state.serialize());
  assert.equal(state.count('material:wood'),4);
});

test('묘목 성장·상한·중복 생성 방지·플레이어와 밭 보호', async () => {
  const {advancePropsOneDay,MAX_TREES,isPropTile}=await import(urls.props);
  const props=[{type:'sapling',tx:25,ty:20,age:0}];
  for(let i=0;i<3;i++) advancePropsOneDay(props,()=>true,()=>0.9);
  assert.equal(props[0].type,'sapling');
  assert.equal(isPropTile(props,25,20),false);
  advancePropsOneDay(props,()=>false,()=>0.9);
  assert.equal(props[0].type,'sapling');
  advancePropsOneDay(props,()=>true,()=>0.9);
  assert.equal(props[0].type,'tree');
  assert.equal(isPropTile(props,25,20),true);
  const many=Array.from({length:MAX_TREES-1},(_,i)=>({type:'tree',tx:i,ty:2}));
  advancePropsOneDay(many,()=>true,()=>0.5); // probability misses
  assert.equal(many.length,MAX_TREES-1);
  advancePropsOneDay(many,()=>true,()=>0);
  assert.equal(many.length,MAX_TREES);
  const empty=[];
  advancePropsOneDay(empty,()=>true,()=>0);
  assert.equal(empty.length,1); // two attempts cannot share a tile
  const state=new GameState(); state.props=[];
  state.playerPosition={x:25.5*32,y:20.5*32};
  assert.equal(state.isPropSpotFree(25,20),false);
  state.field.till(28,20,true);
  assert.equal(state.isPropSpotFree(27,20),false);
  state.props=[{type:'sapling',tx:30,ty:20,age:2}];
  state.load(state.serialize());
  assert.equal(state.props[0].age,2);
  assert.equal(state.till(30,20),true);
  assert.equal(state.props.length,0);
});


test('상자 제작·설치·보관·꺼내기·파괴 전체 흐름', async () => {
  const {craft,RECIPES}=await import(urls.recipes);
  const state=new GameState();
  const original=state.serialize();
  assert.equal(craft(state,RECIPES[0]),false);
  assert.equal(state.serialize(),original);
  state.addItem('material:wood',10);
  assert.equal(craft(state,RECIPES[0]),true);
  assert.equal(state.count('material:wood'),0);
  assert.equal(state.count('item:wood_chest'),1);
  assert.equal(state.placeChest(5,9),null);
  assert.equal(state.count('item:wood_chest'),0);
  const chest=state.chests[0];
  assert.equal(state.till(5,9),false);
  assert.equal(state.transferChest(chest,'seed:turnip',true,5),true);
  assert.equal(state.count('seed:turnip'),0);
  assert.equal(chest.items['seed:turnip'],5);
  const before=state.serialize();
  assert.equal(state.hitChest(chest),'상자를 먼저 비워 주세요.');
  assert.equal(state.serialize(),before);
  const restored=new GameState();restored.load(before);
  assert.deepEqual(restored.chests,state.chests);
  assert.equal(restored.transferChest(restored.chests[0],'seed:turnip',false,5),true);
  assert.equal(restored.count('seed:turnip'),5);
  for(let i=0;i<3;i++) assert.equal(restored.hitChest(restored.chests[0]),null);
  assert.equal(restored.chests.length,0);
  assert.equal(restored.energy,88);
  assert.equal(restored.count('material:wood'),0);
  assert.equal(restored.count('item:wood_chest'),0);
  assert.equal(restored.till(5,9),true);
  state.load(restored.serialize());
  assert.equal(state.chests.length,0);
});

test('設置 실패는 상자를 보존, 플레이어 몸·밭·지형·나무·상자 중복 차단', () => {
  const state=new GameState();state.addItem('item:wood_chest',10);
  const tree=state.props[0];
  state.till(6,9);
  for(const [x,y] of [[5,8],[6,9],[16,3],[32,3],[0,0],[-1,2],[tree.tx,tree.ty]]) {
    assert.notEqual(state.placeChest(x,y),null);
    assert.equal(state.count('item:wood_chest'),10);
  }
  state.playerPosition={x:6*32-5,y:8.5*32};
  assert.notEqual(state.placeChest(6,8),null);
  state.playerPosition={x:176,y:272};
  assert.equal(state.placeChest(7,9),null);
  assert.notEqual(state.placeChest(7,9),null);
  assert.equal(state.count('item:wood_chest'),9);
  assert.equal(state.isPropSpotFree(7,9),false);
});

test('상자 전송 수량 검증·부분 파괴 저장·구버전 호환·잘못된 로드 원자성', () => {
  const state=new GameState();state.addItem('item:wood_chest');state.placeChest(5,9);
  const c=state.chests[0];
  for(const n of [0,-1,1.5,6]) assert.equal(state.transferChest(c,'seed:turnip',true,n),false);
  assert.equal(state.transferChest({...c},'seed:turnip',true),false);
  state.energy=3;assert.notEqual(state.hitChest(c),null);assert.equal(c.hp,undefined);
  state.energy=100;state.hitChest(c);assert.equal(c.hp,2);
  state.load(state.serialize());assert.equal(state.chests[0].hp,2);
  const saved=legacySave(state.serialize()), before=state.serialize();
  const invalid=[{...saved.chests[0],hp:0},{...saved.chests[0],tx:32,ty:3},{...saved.chests[0],items:{'material:fake':1}},{...saved.chests[0],items:{'seed:turnip':-1}}];
  for(const bad of invalid) {
    assert.throws(()=>state.load(JSON.stringify({...saved,chests:[bad]})));
    assert.equal(state.serialize(),before);
  }
  assert.throws(()=>state.load(JSON.stringify({...saved,chests:[saved.chests[0],saved.chests[0]]})));
  delete saved.chests;state.load(JSON.stringify(saved));assert.deepEqual(state.chests,[]);
});


test('낚시 대기 2~6초와 1초 반응창, 조기 입력·지각·중복 성공 차단', async () => {
  const {FishingAttempt}=await import(urls.fish);
  const a=new FishingAttempt(()=>0);
  assert.equal(a.waitMs,2000);
  assert.equal(a.tick(1999),null);
  assert.equal(a.tick(1),'bite');
  assert.equal(a.tick(999),null);
  assert.equal(a.strike(),true);
  assert.equal(a.strike(),false);
  const late=new FishingAttempt(()=>0);
  assert.equal(late.tick(3000),'miss');
  assert.equal(late.strike(),false);
  const early=new FishingAttempt(()=>0.999);
  assert.ok(early.waitMs>=2000 && early.waitMs<6000);
  assert.equal(early.strike(),false);
  assert.equal(early.tick(9999),null);
});

test('계절 물고기 가중치와 인벤토리·상자 저장·판매', async () => {
  const {pickFish}=await import(urls.fish);
  const {itemInfo}=await import(urls.items);
  const {sellOneFish}=await import(urls.shop);
  assert.equal(pickFish('spring',()=>0.99).id,'carp');
  assert.equal(pickFish('summer',()=>0.99).id,'bass');
  assert.equal(pickFish('winter',()=>0.99).id,'salmon');
  assert.equal(pickFish('fall',()=>0.49).id,'carp');
  assert.equal(pickFish('fall',()=>0.5).id,'bass');
  assert.equal(pickFish('fall',()=>0.8).id,'salmon');
  const state=new GameState();state.addItem('fish:salmon',2);
  assert.equal(itemInfo('fish:salmon').category,'fish');
  state.addItem('item:wood_chest');state.placeChest(5,9);
  state.transferChest(state.chests[0],'fish:salmon',true);
  const restored=new GameState();restored.load(state.serialize());
  assert.equal(restored.chests[0].items['fish:salmon'],1);
  assert.equal(restored.count('fish:salmon'),1);
  assert.equal(sellOneFish(restored,'fish:salmon'),90);
  assert.equal(restored.gold,190);
  assert.equal(sellOneFish(restored,'fish:salmon'),0);
  const bad=JSON.parse(state.serialize());bad.inventory['fish:fake']=1;
  assert.throws(()=>restored.load(JSON.stringify(bad)));
  assert.equal('fishing' in JSON.parse(state.serialize()),false);
});


test('타이틀 이어하기·새 게임 저장 교체·손상 및 저장 실패 처리', async () => {
  const {SAVE_KEY,readSave,writeSave}=await import(urls.save);
  const slots=new Map();
  const storage={getItem:key=>slots.get(key)??null,setItem:(key,value)=>slots.set(key,value)};
  assert.equal(readSave(storage),null);
  const state=new GameState();state.day=55;state.gold=777;state.props=[];
  state.addItem('item:wood_chest');state.placeChest(5,9);
  state.transferChest(state.chests[0],'seed:turnip',true,3);
  writeSave(state,storage);
  const restored=readSave(storage);
  assert.equal(restored.day,55);assert.equal(restored.gold,777);
  assert.deepEqual(restored.chests,state.chests);assert.deepEqual(restored.props,[]);
  const fresh=new GameState();writeSave(fresh,storage);
  const reset=readSave(storage);
  assert.equal(reset.day,1);assert.equal(reset.gold,100);
  assert.deepEqual(reset.chests,[]);assert.deepEqual(reset.props,fresh.props);
  assert.deepEqual(reset.buildings,fresh.buildings);assert.equal(reset.count('seed:turnip'),5);
  slots.set(SAVE_KEY,'broken');assert.throws(()=>readSave(storage));assert.equal(slots.get(SAVE_KEY),'broken');
  assert.throws(()=>writeSave(fresh,{getItem:()=>null,setItem:()=>{throw new Error('quota');}}));
  assert.throws(()=>writeSave(fresh,{getItem:()=>null,setItem:()=>{}}));
});

test('취침 후 저장은 다음 날·회복 에너지·시든 작물 상태를 복원', async () => {
  const {readSave,writeSave}=await import(urls.save);
  let slot=null;const storage={getItem:()=>slot,setItem:(_key,value)=>{slot=value;}};
  for(const forced of [false,true]) {
    const state=new GameState();state.day=28;state.till(5,9);state.plant(5,9,'turnip');
    state.sleep(forced);writeSave(state,storage);
    const restored=readSave(storage);
    assert.equal(restored.day,29);assert.equal(restored.minutes,360);
    assert.equal(restored.energy,forced?70:100);
    assert.equal(restored.field.get(5,9).crop,undefined);
  }
});

test('v1 고정 저장 샘플은 farm으로 이관되고 v2 재저장 후 모든 진행이 유지', async () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/legacy-save-v1.json', import.meta.url), 'utf8'));
  const state = new GameState();
  state.load(JSON.stringify(legacy));
  const saved = JSON.parse(state.serialize());
  assert.equal(saved.version, 2);
  assert.equal(saved.currentMap, 'farm');
  assert.equal('field' in saved, false);
  for (const key of ['field', 'props', 'chests']) assert.deepEqual(saved.maps.farm[key], legacy[key]);
  const { INITIAL_BUILDINGS } = await import(urls.buildings);
  assert.deepEqual(saved.maps.farm.buildings, INITIAL_BUILDINGS);
  for (const key of ['day','minutes','energy','weather','tomorrowWeather','gold','inventory','selectedSeed']) {
    assert.deepEqual(saved[key], legacy[key]);
  }
  const restored = new GameState();
  restored.load(state.serialize());
  assert.equal(restored.serialize(), state.serialize());
  legacy.buildings = [];
  restored.load(JSON.stringify(legacy));
  assert.deepEqual(restored.buildings, []);
});

test('현재 맵 접근자는 해당 데이터만 변경하고 모든 맵을 독립 저장·복원', () => {
  const state = new GameState();
  assert.deepEqual(Object.keys(state.maps), ['farm']);
  const other = new GameState().map; // Test-only map; no second map is shipped.
  state.maps.test_map = other;
  state.currentMap = 'test_map';
  state.props = [];
  state.buildings = [];
  state.field.till(1, 2, true);
  state.chests.push({ type:'wood_chest', tx:28, ty:20, items:{'material:wood':3} });
  assert.equal(state.map, other);
  assert.equal(state.maps.farm.field.entries().length, 0);
  assert.ok(state.maps.farm.props.length > 0);
  assert.equal(state.maps.farm.chests.length, 0);
  assert.equal(state.maps.farm.buildings.length, 1);
  const restored = new GameState();
  restored.load(state.serialize());
  assert.equal(restored.currentMap, 'test_map');
  assert.equal(restored.serialize(), state.serialize());
  restored.chests[0].items['material:wood'] = 1;
  assert.equal(state.chests[0].items['material:wood'], 3);
  restored.currentMap = 'farm';
  assert.equal(restored.field.entries().length, 0);
  assert.equal(restored.chests.length, 0);
});

test('손상된 맵·현재 맵·건물·비활성 맵 데이터도 전체 로드를 원자적으로 거부', () => {
  const state = new GameState();
  const before = state.serialize();
  const saved = JSON.parse(before);
  const badMaps = [null, [], {}, {farm:null}, {farm:{...saved.maps.farm, buildings:null}},
    {farm:{...saved.maps.farm, buildings:[{type:'unknown',tx:32,ty:3}]}},
    {farm:{...saved.maps.farm, buildings:[{type:'house',tx:49,ty:35}]}},
    {farm:{...saved.maps.farm, buildings:[...saved.maps.farm.buildings,...saved.maps.farm.buildings]}},
    {farm:{...saved.maps.farm, field:[['0,0',{tilled:true,watered:false}]]}},
    {farm:saved.maps.farm, broken:{...saved.maps.farm,chests:[{type:'unknown',tx:1,ty:2,items:{}}]}}];
  for (const maps of badMaps) {
    assert.throws(() => state.load(JSON.stringify({...saved, maps})));
    assert.equal(state.serialize(), before);
  }
  for (const currentMap of ['missing', '__proto__', 0]) {
    assert.throws(() => state.load(JSON.stringify({...saved,currentMap})));
    assert.equal(state.serialize(), before);
  }
});
