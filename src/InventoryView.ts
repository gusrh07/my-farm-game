import Phaser from 'phaser';
import type { GameState } from './state';
import { itemInfo, type ItemCategory } from './items';

export class InventoryView {
  private layer: Phaser.GameObjects.Container;
  private columns: Phaser.GameObjects.Text[];
  private title: Phaser.GameObjects.Text;
  visible = false;
  constructor(scene: Phaser.Scene) {
    this.layer = scene.add.container(0, 0).setDepth(200).setVisible(false);
    this.layer.add(scene.add.rectangle(400, 300, 800, 600, 0x17251a, 0.65));
    this.layer.add(scene.add.rectangle(400, 310, 700, 400, 0xf6efd6).setStrokeStyle(2, 0x8c9c6b));
    this.title = scene.add.text(78, 132, '', { fontFamily: 'system-ui', fontSize: '22px', color: '#354b38' });
    this.layer.add(this.title);
    this.columns = [70, 207, 344, 481, 618].map(x => scene.add.text(x, 190, '', {
      fontFamily: 'system-ui', fontSize: '13px', color: '#354b38', lineSpacing: 12, wordWrap: { width: 125 },
    }));
    this.layer.add(this.columns);
    this.layer.add(scene.add.text(78, 467, 'I / Esc 닫기 · 소지품을 보는 동안 시간이 멈춥니다.', {
      fontFamily: 'system-ui', fontSize: '14px', color: '#607052',
    }));
  }
  setVisible(visible: boolean, state: GameState) {
    this.visible = visible;
    this.layer.setVisible(visible);
    if (!visible) return;
    this.title.setText(`소지품                         ${state.gold}G`);
    const groups: Record<ItemCategory, string[]> = { seed: [], crop: [], material: [], item: [], fish: [] };
    for (const [id, count] of Object.entries(state.inventory)) {
      if (count <= 0) continue;
      const info = itemInfo(id);
      groups[info.category].push(`${info.name} ×${count}`);
    }
    (['seed', 'crop', 'material', 'item', 'fish'] as const).forEach((category, index) => {
      this.columns[index].setText(`[${['씨앗', '수확물', '재료', '설치물', '물고기'][index]}]\n\n${groups[category].join('\n') || '없음'}`);
    });
  }
}
