import Phaser from 'phaser';
import type { GameState } from './state';
import type { ChestInstance } from './chests';
import { itemInfo } from './items';
import { audio } from './audio';
export class ChestScene extends Phaser.Scene {
  private state!: GameState;
  private chest!: ChestInstance;
  private side: 'bag' | 'chest' = 'bag';
  private index = 0;
  private closing = false;
  private columns!: Phaser.GameObjects.Text[];
  private feedback!: Phaser.GameObjects.Text;
  constructor() { super('chest'); }
  init(data: { state: GameState; chest: ChestInstance }) {
    this.state = data.state; this.chest = data.chest;
    this.side = 'bag'; this.index = 0; this.closing = false;
  }
  create() {
    audio.play('ui');
    this.add.rectangle(400, 300, 800, 600, 0x17251a, 0.65);
    this.add.rectangle(400, 310, 720, 470, 0xf6efd6).setStrokeStyle(2, 0x8c9c6b);
    this.add.text(70, 95, '나무상자 · 용량 제한 없음', { fontSize: '22px', color: '#354b38' });
    this.columns = [70, 420].map(x => this.add.text(x, 145, '', {
      fontFamily: 'system-ui', fontSize: '16px', color: '#354b38', lineSpacing: 8,
    }));
    this.feedback = this.add.text(70, 440, '', { fontSize: '14px', color: '#607052' });
    this.add.text(70, 480, '←→ 소지품/상자   ↑↓ 선택   Space 1개 이동   Enter 전부 이동\nF / Esc 닫기 · 열린 동안 시간이 멈춥니다.', { fontSize: '14px', color: '#607052', lineSpacing: 8 });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (!['KeyF','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Enter'].includes(e.code)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code === 'KeyF' || e.code === 'Escape') { this.close(); return; }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { this.side = e.code === 'ArrowLeft' ? 'bag' : 'chest'; this.index = 0; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const n = this.rows().length;
        if (n) this.index = (this.index + (e.code === 'ArrowUp' ? -1 : 1) + n) % n;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        const row = this.rows()[this.index];
        if (row) {
          const n = e.code === 'Enter' ? row[1] : 1;
          const ok = this.state.transferChest(this.chest, row[0], this.side === 'bag', n);
          audio.play(ok ? 'ui' : 'fail');
          this.feedback.setText(ok ? `${itemInfo(row[0]).name} ${n}개 ${this.side === 'bag' ? '보관' : '꺼냄'}` : '옮길 수 없어요.');
        }
      }
      this.index = Math.min(this.index, Math.max(0, this.rows().length - 1));
      this.render();
    };
    window.addEventListener('keydown', onKey, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKey, true));
    this.render();
  }
  private rows(side = this.side) { return Object.entries(side === 'bag' ? this.state.inventory : this.chest.items); }
  private render() {
    (['bag', 'chest'] as const).forEach((side, col) => {
      const rows = this.rows(side), selected = this.side === side;
      const offset = selected ? Math.floor(this.index / 9) * 9 : 0;
      const body = rows.slice(offset, offset + 9).map(([id, n], i) => `${selected && this.index === offset + i ? '▶' : '  '} ${itemInfo(id).name} ×${n}`).join('\n');
      this.columns[col].setColor(selected ? '#865d28' : '#607052').setText(`${side === 'bag' ? '소지품 → 보관' : '상자 → 꺼내기'} (${rows.length}종)\n\n${body || '없음'}`);
    });
  }
  private close() {
    if (this.closing) return;
    this.closing = true;
    this.scene.resume('main'); this.scene.stop();
  }
}
