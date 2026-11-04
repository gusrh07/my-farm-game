import { TitleScene } from './TitleScene';
import { PauseScene } from './PauseScene';
import { SAVE_KEY, writeSave } from './save';
import { FishingAttempt, pickFish } from './fish';
import { chestAt } from './chests';
import { ChestScene } from './ChestScene';
import { isPropTile, findPropAt } from './props';
import { audio } from './audio';
import Phaser from 'phaser';
import './style.css';
import { preloadArt, drawTerrain, drawBuildings, drawProps, drawChests, createFarmerAnimations, animateFarmer, redrawField } from './art';
import { blocksBuilding, isBuildingTile, isNearDoor } from './buildings';
import { SleepConfirmScene } from './SleepConfirmScene';
import { LightingScene } from './LightingScene';
import { GameState, TOOL_COST, SEASON_LABEL, WEATHER_LABEL, REAL_MS_PER_GAME_10MIN } from './state';
import { ShopScene } from './ShopScene';
import { UIScene, STATUS_HEIGHT, STATUS_KEY } from './UIScene';
import { CROPS } from './crops';
import { TILE_SIZE, COLS, ROWS, TILE_INFO, SPAWN, worldToTile, frontTile, tileAt, moveWithCollision, type Facing } from './world';

const WIDTH = 800;
const HEIGHT = 600;
const SPEED = 200; // 초당 이동 거리(px)
const SLEEP_START = 18 * 60;

type Tool = 'hoe' | 'water' | 'seed' | 'harvest' | 'axe' | 'rod';
const TOOLS: Tool[] = ['hoe', 'water', 'seed', 'harvest', 'axe', 'rod'];
const TOOL_NAMES = { hoe: '호미', water: '물뿌리개', seed: '순무 씨앗', harvest: '수확', axe: '도끼', rod: '낚싯대' };

class MainScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private resetKey!: Phaser.Input.Keyboard.Key;
  private direction = new Phaser.Math.Vector2();
  private facing: Facing = 'down';
  private target!: Phaser.GameObjects.Rectangle;
  private shadow!: Phaser.GameObjects.Ellipse;
  private state = new GameState();
  private fishing?: FishingAttempt;
  private fishingMark!: Phaser.GameObjects.Text;
  private chestArt!: Phaser.GameObjects.Group;
  private placeKey!: Phaser.Input.Keyboard.Key;
  private propArt!: Phaser.GameObjects.Group;
  private fieldArt!: Phaser.GameObjects.Group;
  private action!: Phaser.Input.Keyboard.Key;
  private sleepKey?: Phaser.Input.Keyboard.Key;
  private skipHourKey?: Phaser.Input.Keyboard.Key;
  private shopKey!: Phaser.Input.Keyboard.Key;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private seedKey!: Phaser.Input.Keyboard.Key;
  private justResumed = false;
  private toolKeys!: Phaser.Input.Keyboard.Key[];
  private tool: Tool = 'hoe';
  private message = '잔디를 갈고 순무를 심어 보세요.';
  private hud = document.querySelector<HTMLElement>('#farm-status')!;

  constructor() {
    super('main');
  }

  init(data: { state?: GameState }) {
    this.state = data.state ?? new GameState();
    this.facing = 'down'; this.tool = 'hoe'; this.justResumed = false; this.fishing = undefined;
    this.message = '농장에 오신 것을 환영해요. Esc로 메뉴를 열 수 있어요.';
  }

  preload() { preloadArt(this); }

  // 씬을 시작할 때 한 번 실행합니다.
  create() {
    document.querySelectorAll<HTMLButtonElement>('#save-game, #load-game').forEach(b => b.disabled = false);
    const onMute = (event: Event) => this.notify((event as CustomEvent<boolean>).detail ? '소리 끔' : '소리 켬');
    window.addEventListener('farm-mute', onMute);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { window.removeEventListener('farm-mute', onMute); audio.setRain(false); for (const key of ['lighting', 'ui', 'shop', 'sleepConfirm', 'chest']) this.scene.stop(key); });
    drawTerrain(this);
    drawBuildings(this, this.state.buildings);
    this.propArt = this.add.group();
    this.chestArt = this.add.group();
    drawProps(this, this.propArt, this.state.props);
    createFarmerAnimations(this);
    this.fieldArt = this.add.group();
    this.redrawSoil();
    this.target = this.add.rectangle(0, 0, TILE_SIZE - 4, TILE_SIZE - 4).setStrokeStyle(2, 0xffef91).setDepth(3);
    this.shadow = this.add.ellipse(SPAWN.x, SPAWN.y + 10, 23, 8, 0x243226, 0.24).setDepth(4);
    this.player = this.add.sprite(SPAWN.x, SPAWN.y, 'farmer').setScale(2);
    animateFarmer(this.player, this.facing, false);
    this.cameras.main
      .setViewport(0, 0, WIDTH, HEIGHT - STATUS_HEIGHT)
      .setBounds(0, 0, COLS * TILE_SIZE, ROWS * TILE_SIZE)
      .setZoom(2)
      .startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.registry.set(STATUS_KEY, '');
    this.scene.launch('lighting', { state: this.state });
    this.scene.launch('ui', { state: this.state, player: this.player, camera: this.cameras.main, getTool: () => this.tool });
    this.fishingMark = this.add.text(0, 0, '●', { fontSize: '16px', color: '#ffec84', stroke: '#293e34', strokeThickness: 2 }).setOrigin(0.5).setDepth(1900).setVisible(false);
    const cancelFishing = () => this.cancelFishing();
    this.events.on(Phaser.Scenes.Events.PAUSE, cancelFishing);
    const onFishingEscape = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat || !this.scene.isActive('main')) return;
      e.preventDefault(); e.stopPropagation();
      if (this.fishing) { this.cancelFishing(); this.notify('낚시를 취소했어요.'); return; }
      this.input.keyboard!.resetKeys(); this.input.keyboard!.enabled = false;
      this.scene.launch('pauseMenu', { save: () => this.saveGame(), title: () => { this.scene.start('title'); } });
      this.scene.pause();
    };
    window.addEventListener('keydown', onFishingEscape, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.events.off(Phaser.Scenes.Events.PAUSE, cancelFishing); window.removeEventListener('keydown', onFishingEscape, true); });
    const keyboard = this.input.keyboard!;
    keyboard.enabled = true; keyboard.resetKeys();
    this.cursors = keyboard.createCursorKeys();
    this.resetKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.action = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    if (import.meta.env.DEV) {
      this.sleepKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
      this.skipHourKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    }
    this.shopKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.placeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    const onSleep = () => this.sleep();
    this.events.on('sleep-voluntary', onSleep);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('sleep-voluntary', onSleep));
    this.seedKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    const saveButton = document.querySelector<HTMLButtonElement>('#save-game')!;
    const loadButton = document.querySelector<HTMLButtonElement>('#load-game')!;
    const runSaveAction = (action: 'save' | 'load') => {
      const result = document.querySelector<HTMLElement>('#save-result')!;
      if (!this.scene.isActive('main')) {
        result.textContent = '열린 창을 닫은 뒤 저장·불러오기를 사용하세요.';
        return;
      }
      if (action === 'save') this.saveGame();
      else this.loadGame();
      result.textContent = this.message;
      this.updateTarget();
    };
    const onSave = () => runSaveAction('save');
    const onLoad = () => runSaveAction('load');
    const onSaveKey = (event: KeyboardEvent) => {
      const key = event.code || event.key;
      if (key !== 'F2' && key !== 'F4') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) runSaveAction(key === 'F2' ? 'save' : 'load');
    };
    window.addEventListener('keydown', onSaveKey, true);
    saveButton.addEventListener('click', onSave);
    loadButton.addEventListener('click', onLoad);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onSaveKey, true);
      saveButton.removeEventListener('click', onSave);
      loadButton.removeEventListener('click', onLoad);
    });
    const onResume = () => {
      keyboard.resetKeys();
      keyboard.enabled = true;
      this.justResumed = true;
      this.updateTarget();
    };
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.RESUME, onResume));
    this.toolKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].map(key => keyboard.addKey(key));
    this.updateTarget();
  }

  // 매 프레임 실행합니다. delta는 이전 프레임 이후 흐른 밀리초입니다.
  update(_time: number, delta: number) {
    if (this.justResumed) {
      this.justResumed = false;
      this.input.keyboard!.resetKeys();
      return;
    }
    if (this.fishing) { this.updateFishing(delta); return; }
    if (Phaser.Input.Keyboard.JustDown(this.interactKey) && !this.interactKey.originalEvent.repeat) {
      const front = frontTile(this.player, this.facing);
      const chest = chestAt(this.state.chests, front.col, front.row);
      if (chest) {
        this.input.keyboard!.resetKeys();
        this.input.keyboard!.enabled = false;
        this.scene.launch('chest', { state: this.state, chest });
        this.scene.pause();
        return;
      }
      const { col, row } = worldToTile(this.player);
      if (isNearDoor(this.state.buildings, col, row)) {
        if (this.state.minutes < SLEEP_START) {
          this.warn('아직 졸리지 않아요 (18:00 이후에 잘 수 있어요)');
        } else {
        if (!this.scene.isActive('sleepConfirm')) {
          this.input.keyboard!.resetKeys();
          this.input.keyboard!.enabled = false;
          this.scene.launch('sleepConfirm');
          this.scene.pause();
        }
        return;
        }
      } else {
        this.notify('집 문 앞에서 F를 눌러 보세요.');
      }
    }
    // 업데이트에서 열기 때문에 상점을 여는 keydown이 새 씬으로 전달되지 않습니다.
    if (Phaser.Input.Keyboard.JustDown(this.shopKey) && !this.shopKey.originalEvent.repeat) {
      this.input.keyboard!.resetKeys();
      this.input.keyboard!.enabled = false;
      this.scene.launch('shop', { state: this.state });
      this.scene.pause();
      return;
    }
    const { left, right, up, down } = this.cursors;
    this.direction.set(
      Number(right.isDown) - Number(left.isDown),
      Number(down.isDown) - Number(up.isDown),
    );

    // 대각선 입력은 가로 방향을 우선하며, 멈춰도 마지막 방향을 유지합니다.
    if (this.direction.x !== 0) this.facing = this.direction.x < 0 ? 'left' : 'right';
    else if (this.direction.y !== 0) this.facing = this.direction.y < 0 ? 'up' : 'down';

    // 정규화하면 대각선으로 움직일 때도 같은 속도를 유지합니다.
    this.direction.normalize();
    const distance = SPEED * Math.min(delta, 100) / 1000;
    const next = moveWithCollision(this.player, this.direction.x * distance, this.direction.y * distance,
      (col, row) => blocksBuilding(this.state.buildings, col, row) || isPropTile(this.state.props, col, row) || !!chestAt(this.state.chests, col, row));
    const moved = Math.abs(next.x - this.player.x) + Math.abs(next.y - this.player.y) > 0.001;
    this.player.setPosition(next.x, next.y);
    animateFarmer(this.player, this.facing, moved);

    if (Phaser.Input.Keyboard.JustDown(this.resetKey)) {
      this.player.setPosition(SPAWN.x, SPAWN.y);
      this.facing = 'down';
      this.cameras.main.centerOn(this.player.x, this.player.y);
    }
    // 누른 순간 한 번만 실행합니다. 누르고 이동해도 연속으로 갈리지 않습니다.
    this.toolKeys.forEach((key, index) => {
      if (Phaser.Input.Keyboard.JustDown(key)) this.tool = TOOLS[index];
    });
    if (Phaser.Input.Keyboard.JustDown(this.seedKey)) {
      this.state.cycleSeed();
      this.message = this.state.count(`seed:${this.state.selectedSeed}`) > 0
        ? `${CROPS[this.state.selectedSeed].name} 씨앗 선택` : '보유한 씨앗이 없습니다. E로 상점을 여세요.';
    }
    if (Phaser.Input.Keyboard.JustDown(this.placeKey) && !this.placeKey.originalEvent.repeat) {
      const { col, row } = frontTile(this.player, this.facing);
      this.state.playerPosition = { x: this.player.x, y: this.player.y };
      const error = this.state.placeChest(col, row);
      if (error) this.warn(error);
      else { audio.play('ui'); this.notify('상자를 놓았어요. 앞에서 F로 열어 보세요.'); this.redrawSoil(); }
    }
    if (Phaser.Input.Keyboard.JustDown(this.action)) this.useTool();
    this.state.playerPosition = { x: this.player.x, y: this.player.y };
    // 수동 취침과 자정이 겹쳐도 하루만 넘깁니다.
    if (import.meta.env.DEV && this.sleepKey && Phaser.Input.Keyboard.JustDown(this.sleepKey)) this.sleep();
    else {
      const skipHour = import.meta.env.DEV && this.skipHourKey
        && Phaser.Input.Keyboard.JustDown(this.skipHourKey) && !this.skipHourKey.originalEvent.repeat;
      if (this.state.advanceTime(skipHour ? REAL_MS_PER_GAME_10MIN * 6 : delta)) {
        this.cancelFishing();
        audio.play('sleep');
        this.notify('자정이 되어 쓰러졌어요. 다음 날 에너지가 70%로 회복됩니다.');
        this.saveGame(true); this.notifyWithered();
        this.redrawSoil();
      } else if (skipHour) {
        this.notify(`개발: 1시간 이동 → ${this.state.timeLabel}`);
      }
    }
    this.updateTarget();
  }

  private saveGame(automatic = false): boolean {
    try {
      writeSave(this.state);
      if (!automatic) this.message = `저장 완료: ${this.state.day}일차 ${this.state.timeLabel} · ${this.state.gold}G · 밭 ${this.state.field.entries().length}칸`;
      document.querySelector<HTMLElement>('#save-result')!.textContent = automatic ? '취침 자동 저장 완료' : this.message;
      return true;
    } catch {
      this.message = '저장 실패: 브라우저 저장 공간 또는 접근 권한을 확인하세요.';
      document.querySelector<HTMLElement>('#save-result')!.textContent = this.message;
      if (automatic) this.notify(this.message);
      return false;
    }
  }

  private loadGame() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved === null) { this.message = '저장된 게임이 없습니다. F2로 먼저 저장하세요.'; return; }
      this.state.load(saved);
      this.cancelFishing();
      drawProps(this, this.propArt, this.state.props);
    } catch {
      this.message = '불러오기 실패: 저장 데이터 또는 브라우저 접근 권한을 확인하세요. 현재 게임은 유지됩니다.';
      return;
    }
    this.redrawSoil();
    this.message = `불러오기 완료: ${this.state.day}일차 ${this.state.timeLabel} · ${this.state.gold}G · 밭 ${this.state.field.entries().length}칸`;
  }

  private notify(message: string) {
    this.message = message;
    this.events.emit('notify', message);
  }

  private warn(message: string) { this.notify(message); audio.play('fail'); }

  private useTool() {
    const { col, row } = frontTile(this.player, this.facing);
    if (this.tool === 'rod') {
      if (tileAt(col, row) !== 1) { this.warn('연못을 바라보고 낚싯대를 사용하세요.'); return; }
      if (!this.state.useEnergy(TOOL_COST.rod)) { this.warn('낚시할 에너지가 부족해요.'); return; }
      this.fishing = new FishingAttempt();
      this.fishingMark.setPosition((col + 0.5) * TILE_SIZE, (row + 0.5) * TILE_SIZE).setText('●').setVisible(true);
      animateFarmer(this.player, this.facing, false);
      audio.play('cast');
      this.notify('입질을 기다리세요… 느낌표가 뜨면 Space! (Esc 취소)');
      return;
    }
    const chest = chestAt(this.state.chests, col, row);
    if (this.tool === 'axe' && chest) {
      const error = this.state.hitChest(chest);
      if (error) this.warn(error);
      else { audio.play('hoe'); this.notify(chest.hp === 0 ? '상자를 부쉈어요. 재료는 반환되지 않습니다.' : '상자 남은 체력 ' + chest.hp); this.redrawSoil(); }
      return;
    }
    if (this.tool === 'axe' && findPropAt(this.state.props, col, row)?.type !== 'tree') return;
    if (this.state.energy < TOOL_COST[this.tool]) {
      this.warn('에너지가 부족해요. 18:00 이후 집 문 앞에서 F로 잠자면 회복됩니다.');
      return;
    }
    switch (this.tool) {
      case 'axe': {
        const result = this.state.chop(col, row);
        if (result.hit) {
          audio.play('hoe');
          if (result.wood) this.notify('목재 ' + result.wood + '개를 얻었어요.');
          else this.message = '도끼질 성공 · 남은 체력 ' + findPropAt(this.state.props, col, row)?.hp;
        }
        break;
      }
      case 'hoe':
        if (chest) { this.warn('상자가 있는 곳은 갈 수 없어요.'); break; }
        if (isPropTile(this.state.props, col, row)) { this.warn('나무가 있는 곳은 갈 수 없어요.'); break; }
        if (isBuildingTile(this.state.buildings, col, row)) { this.warn('건물이 있는 곳은 갈 수 없어요.'); break; }
        if (tileAt(col, row) !== 0) { this.warn('여기는 갈 수 없어요. 잔디에서 사용하세요.'); break; }
        this.message = this.state.till(col, row) && (audio.play('hoe'), true) ? `땅을 갈았습니다. 에너지 -${TOOL_COST.hoe}` : '아직 갈지 않은 잔디에 사용하세요.';
        break;
      case 'water':
        if (!this.state.field.get(col, row)) { this.warn('먼저 호미로 땅을 갈아 주세요.'); break; }
        this.message = this.state.water(col, row) && (audio.play('water'), true) ? `물을 주었습니다. 에너지 -${TOOL_COST.water}` : '갈린 땅에 하루 한 번 물을 줄 수 있습니다.';
        break;
      case 'seed': {
        const id = this.state.selectedSeed;
        if (this.state.count(`seed:${id}`) <= 0) {
          this.warn('선택한 씨앗이 없어요. E로 상점을 여세요.');
          break;
        }
        if (!this.state.canPlant(id)) {
          this.warn(`${CROPS[id].name}는 지금 심을 수 없어요. 파종 계절: ${CROPS[id].seasons.map(season => SEASON_LABEL[season]).join('·')}`);
          break;
        }
        const soil = this.state.field.get(col, row);
        if (!soil) { this.warn('먼저 호미로 땅을 갈아 주세요.'); break; }
        if (soil.crop) { this.warn('이미 작물이 심어져 있어요.'); break; }
        this.message = this.state.count(`seed:${id}`) === 0 ? '선택한 씨앗이 없습니다. E로 상점을 여세요.'
          : this.state.plant(col, row, id) && (audio.play('plant'), true) ? `${CROPS[id].name}를 심었습니다. 씨앗 1개 사용.${id !== this.state.selectedSeed ? ` ${CROPS[this.state.selectedSeed].name} 씨앗으로 자동 전환.` : ''}` : '작물이 없는 갈린 땅에 심으세요.';
        break;
      }
      case 'harvest': {
        const id = this.state.harvest(col, row);
        if (!id) {
          this.warn(this.state.field.get(col, row)?.crop ? '아직 자라는 중이에요. 다 자라면 수확하세요.' : '수확할 작물이 없어요.');
          break;
        }
        audio.play('harvest');
        this.message = id ? `${CROPS[id].name} 1개를 인벤토리에 넣었습니다. E로 상점을 여세요.` : '다 자란 작물만 수확할 수 있습니다.';
        break;
      }
    }
    this.redrawSoil();
  }

  private cancelFishing() {
    this.fishing = undefined;
    this.fishingMark?.setVisible(false);
    this.input.keyboard?.resetKeys();
  }

  private updateFishing(delta: number) {
    if (this.state.advanceTime(delta)) {
      this.cancelFishing(); audio.play('sleep');
      this.notify('자정이 되어 잠들었어요. 에너지는 70%로 회복됩니다.');
      this.saveGame(true); this.notifyWithered(); this.redrawSoil(); this.updateTarget(); return;
    }
    const result = this.fishing!.tick(delta);
    if (result === 'miss') { this.cancelFishing(); this.warn('물고기를 놓쳤어요.'); }
    else {
      if (result === 'bite') { this.fishingMark.setText('!'); audio.play('bite'); this.notify('입질! 지금 Space!'); }
      if (Phaser.Input.Keyboard.JustDown(this.action) && !this.action.originalEvent.repeat) {
        const caught = this.fishing!.strike();
        this.cancelFishing();
        if (caught) {
          const fish = pickFish(this.state.season);
          if (this.state.addItem('fish:' + fish.id)) { audio.play('catch'); this.notify(fish.name + ' 1마리를 잡았어요!'); }
          else this.warn('소지품 수량이 너무 많아요.');
        } else this.warn('너무 일찍 당겼어요. 입질을 기다려 주세요.');
      }
    }
    this.updateTarget();
  }

  private sleep() {
    this.cancelFishing();
    this.state.playerPosition = { x: this.player.x, y: this.player.y };
    this.state.sleep();
    audio.play('sleep');
    this.message = `다음 날입니다. 물 준 작물이 자랐습니다. ${this.state.weather === 'rain' ? '비가 와서 밭이 젖었습니다.' : '밭이 말랐습니다.'}`;
    this.saveGame(true); this.notifyWithered();
    this.redrawSoil();
  }

  private notifyWithered() {
    if (this.state.lastWitheredCount > 0) {
      this.notify(`계절이 바뀌어 작물 ${this.state.lastWitheredCount}개가 시들었어요.`);
    }
  }

  private redrawSoil() {
    redrawField(this, this.fieldArt, this.state.field);
    drawChests(this, this.chestArt, this.state.chests);
    drawProps(this, this.propArt, this.state.props);
  }

  private updateTarget() {
    const current = worldToTile(this.player);
    const front = frontTile(this.player, this.facing);
    const tile = tileAt(front.col, front.row);
    const blocked = tile === undefined || TILE_INFO[tile].blocked || blocksBuilding(this.state.buildings, front.col, front.row) || isPropTile(this.state.props, front.col, front.row) || !!chestAt(this.state.chests, front.col, front.row);
    const exhausted = this.state.energy < TOOL_COST[this.tool];
    this.target.setPosition((front.col + 0.5) * TILE_SIZE, (front.row + 0.5) * TILE_SIZE)
      .setVisible(tile !== undefined).setStrokeStyle(2, exhausted ? 0xff5252 : blocked ? 0xff9c87 : 0xffef91);
    this.shadow.setPosition(this.player.x, this.player.y + 10);
    const names = { up: '위', down: '아래', left: '왼쪽', right: '오른쪽' };
    const soil = this.state.field.get(front.col, front.row);
    const crop = soil?.crop;
    const soilHint = !soil ? '경작 전' : `${soil.watered ? '물 줌' : '마름'} · ${crop ? `${CROPS[crop.id].name} ${crop.daysGrown}/${CROPS[crop.id].growDays}${this.state.field.isRipe(front.col, front.row) ? ' 수확 가능' : ''}` : '빈 밭'}`;
    this.registry.set(STATUS_KEY, `현재 (${current.col}, ${current.row}) · ${names[this.facing]} · 앞 (${front.col}, ${front.row}) ${tile === undefined ? '맵 밖' : TILE_INFO[tile].name} · ${blocked ? '이동 불가' : '이동 가능'} · ${soilHint}`);
    const cropName = CROPS[this.state.selectedSeed].name;
    const toolName = this.tool === 'seed' ? `${cropName} 씨앗` : TOOL_NAMES[this.tool];
    const hudText = `${SEASON_LABEL[this.state.season]} ${this.state.dayOfSeason}일 (누적 ${this.state.day}일) ${this.state.timeLabel} · ${WEATHER_LABEL[this.state.weather]} / 내일 ${WEATHER_LABEL[this.state.tomorrowWeather]} · 에너지 ${this.state.energy}/${this.state.maxEnergy}${exhausted ? ' (도구 사용 불가)' : ''} · ${this.state.gold}G · ${cropName} 씨앗 ${this.state.count(`seed:${this.state.selectedSeed}`)}개 / 수확물 ${this.state.count(`crop:${this.state.selectedSeed}`)}개 · 목재 ${this.state.count('material:wood')}개 · 선택: ${toolName} · ${this.message}`;
    if (this.hud.textContent !== hudText) this.hud.textContent = hudText;
  }
}

const disposeAudio = audio.install();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#60894b',
  pixelArt: true,
  roundPixels: true,
  scene: [TitleScene, MainScene, PauseScene, LightingScene, UIScene, ShopScene, SleepConfirmScene, ChestScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});







game.events.once(Phaser.Core.Events.DESTROY, disposeAudio);

