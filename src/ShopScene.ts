import { FISH } from './fish';
import { MATERIAL_PRICE } from './items';
import { audio } from './audio';
import { RECIPES, craft, canCraft } from './recipes';
import { itemInfo } from './items';
import Phaser from 'phaser';
import { CROPS, type CropDef } from './crops';
import type { GameState } from './state';
import { SEASON_LABEL } from './state';
import { buySeed, sellOneCrop, sellOneMaterial, sellOneFish } from './shop';

export class ShopScene extends Phaser.Scene {
  private state!: GameState;
  private tab: 'buy' | 'sell' | 'craft' = 'buy';
  private index = 0;
  private message = '';
  private closing = false;
  private heading!: Phaser.GameObjects.Text;
  private buyText!: Phaser.GameObjects.Text;
  private sellText!: Phaser.GameObjects.Text;
  private feedback!: Phaser.GameObjects.Text;

  constructor() { super('shop'); }

  init(data: { state: GameState }) {
    this.state = data.state;
    this.tab = 'buy';
    this.index = 0;
    this.closing = false;
    this.message = '거래할 항목을 선택하세요. 한 번에 1개씩 거래합니다.';
  }

  create() {
    audio.play('ui');
    // Keep transient notifications visible above the shop overlay.
    this.scene.bringToTop('ui');
    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.6);
    this.add.rectangle(400, 300, 720, 520, 0xf6efd6).setStrokeStyle(2, 0x8c9c6b);
    const style = { fontFamily: 'system-ui', fontSize: '16px', color: '#354b38', lineSpacing: 6 };
    this.heading = this.add.text(70, 72, '', { ...style, fontSize: '24px' });
    this.buyText = this.add.text(70, 130, '', style);
    this.sellText = this.add.text(414, 130, '', style);
    this.feedback = this.add.text(70, 425, '', { ...style, wordWrap: { width: 650 } });
    this.add.text(70, 490, '←→ 구매/판매/제작   ↑↓ 항목 선택   Space 1개 거래\nE / Esc 닫기 · 상점에서는 시간이 멈춥니다.', { ...style, fontSize: '15px' });

    const keyboard = this.input.keyboard!;
    // Esc가 Phaser까지 전달되지 않는 환경에서도 window 캡처 단계에서 닫습니다.
    // 상점이 열려 있을 때만 등록하고, 종료 시 반드시 해제합니다.
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' && event.key !== 'Escape' && event.key !== 'Esc') return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    };
    window.addEventListener('keydown', onWindowKeyDown, true);
    // 키를 누르고 있어도 반복 거래하지 않습니다. 씬 종료 시 이 리스너만 해제합니다.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      switch (event.code) {
        case 'KeyE': case 'Escape': this.close(); return;
        case 'ArrowLeft': this.switchTab(-1); break;
        case 'ArrowRight': this.switchTab(1); break;
        case 'ArrowUp': this.move(-1); break;
        case 'ArrowDown': this.move(1); break;
        case 'Space': this.confirm(); break;
        default: return;
      }
      if (event.code.startsWith('Arrow')) audio.play('ui');
      this.render();
    };
    keyboard.on('keydown', onKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off('keydown', onKeyDown);
      window.removeEventListener('keydown', onWindowKeyDown, true);
    });
    this.render();
  }

  private rows(tab = this.tab): CropDef[] {
    const crops = Object.values(CROPS).filter(crop => tab === 'buy' || this.state.count('crop:' + crop.id) > 0);
    if (tab === 'buy') return crops;
    return [...crops, ...FISH.filter(f => this.state.count('fish:' + f.id) > 0).map(f => ({ id: 'fish:' + f.id, name: f.name, sellPrice: f.sell, seedPrice: 0, growDays: 0, color: 0, seasons: [] })), ...Object.entries(MATERIAL_PRICE).filter(([id]) => this.state.count(id) > 0).map(([id, item]) => ({ id, name: item.name, sellPrice: item.sell, seedPrice: 0, growDays: 0, color: 0, seasons: [] }))];
  }

  private move(direction: number) {
    const length = this.tab === 'craft' ? RECIPES.length : this.rows().length;
    if (length) this.index = (this.index + direction + length) % length;
  }

  private confirm() {
    if (this.tab === 'craft') {
      const recipe = RECIPES[this.index];
      if (!recipe) return;
      const success = craft(this.state, recipe);
      audio.play(success ? 'coin' : 'fail');
      this.message = success ? `${recipe.name} 제작 완료. G로 앞 칸에 설치하세요.` : '제작 재료가 부족해요.';
      return;
    }
    const crop = this.rows()[this.index];
    if (!crop) { audio.play('fail'); this.message = '판매할 수확물이 없습니다.'; return; }
    if (this.tab === 'buy') {
      const success = buySeed(this.state, crop.id);
      audio.play(success ? 'coin' : 'fail');
      this.message = success
        ? `${crop.name} 씨앗 1개 구매 (-${crop.seedPrice}G)` : '골드가 부족합니다.';
    } else {
      const price = crop.id.startsWith('fish:') ? sellOneFish(this.state, crop.id) : crop.id.startsWith('material:') ? sellOneMaterial(this.state, crop.id) : sellOneCrop(this.state, crop.id);
      audio.play(price ? 'coin' : 'fail');
      this.message = price ? `${crop.name} 1개 판매 (+${price}G)` : '판매할 수확물이 없습니다.';
    }
    this.index = Math.min(this.index, Math.max(0, this.rows().length - 1));
  }

  private close() {
    if (this.closing) return;
    this.closing = true;
    this.scene.resume('main');
    this.scene.stop();
  }

  private switchTab(direction: number) {
    const tabs = ['buy', 'sell', 'craft'] as const;
    this.tab = tabs[(tabs.indexOf(this.tab) + direction + tabs.length) % tabs.length];
    this.index = 0;
  }

  private render() {
    this.heading.setText(`구매 / 판매 / 제작 · ${this.tab === 'buy' ? '구매' : this.tab === 'sell' ? '판매' : '제작'}     ${this.state.gold}G`);
    this.sellText.setVisible(this.tab !== 'craft');
    if (this.tab === 'craft') {
      this.buyText.setColor(canCraft(this.state, RECIPES[this.index]) ? '#865d28' : '#888888').setText(RECIPES.map((r, i) =>
        `${i === this.index ? '▶' : '  '} ${r.name}\n    ${Object.entries(r.cost).map(([id,n]) => `${itemInfo(id).name} ${n}개 필요 (보유 ${this.state.count(id)})`).join(', ')}`
      ).join('\n\n'));
    } else {
    for (const tab of ['buy', 'sell'] as const) {
      const rows = this.rows(tab);
      const title = tab === 'buy' ? '구매 · 씨앗' : '판매 · 수확물';
      const body = rows.map((crop, index) => {
        const selected = this.tab === tab && this.index === index;
        const count = this.state.count((crop.id.startsWith('material:') || crop.id.startsWith('fish:')) ? crop.id : `${tab === 'buy' ? 'seed' : 'crop'}:${crop.id}`);
        return `${selected ? '▶' : '  '} ${crop.name}  ${tab === 'buy' ? crop.seedPrice : crop.sellPrice}G  (${count}개)${tab === 'buy' ? `\n    ${crop.seasons.map(season => SEASON_LABEL[season]).join('·')} 파종${this.state.canPlant(crop.id) ? '' : ' / 지금 불가'}` : ''}`;
      }).join('\n');
      (tab === 'buy' ? this.buyText : this.sellText)
        .setColor(this.tab === tab ? '#865d28' : '#708062')
        .setText(`${this.tab === tab ? '[ ' + title + ' ]' : title}\n\n${body || '수확물이 없습니다.'}`);
    }
    }
    this.feedback.setText(this.message);
    const hud = document.querySelector<HTMLElement>('#farm-status');
    if (hud) hud.textContent = `상점 · ${this.state.gold}G · 시간 일시정지 · ${this.message}`;
  }
}





