import Phaser from 'phaser';
import { Minimap, type MinimapData } from './minimap';
import { InventoryView } from './InventoryView';
import { CROPS } from './crops';

export const STATUS_HEIGHT = 24;
export const STATUS_KEY = 'farm-status-text';

// A separate scene keeps the status bar independent of world-camera zoom and scroll.
export class UIScene extends Phaser.Scene {
  private toast!: Phaser.GameObjects.Text;
  private toastTimer?: Phaser.Time.TimerEvent;
  private mini!: Minimap;
  private miniData!: MinimapData;
  private inventory!: InventoryView;
  private hotbar!: Phaser.GameObjects.Container;
  private slots: Phaser.GameObjects.Rectangle[] = [];
  private seedLabel!: Phaser.GameObjects.Text;
  private getTool!: () => string;
  constructor() { super('ui'); }
  init(data: MinimapData & { getTool: () => string }) { this.miniData = data; this.getTool = data.getTool; }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, height - STATUS_HEIGHT, width, STATUS_HEIGHT, 0x293e34).setOrigin(0);
    const text = this.add.text(8, height - STATUS_HEIGHT + 4, this.registry.get(STATUS_KEY) ?? '', {
      fontFamily: 'system-ui', fontSize: '12px', color: '#f7efcf',
    });
    const refresh = (_parent: unknown, value: string) => text.setText(value);
    this.registry.events.on(`changedata-${STATUS_KEY}`, refresh);
    this.toast = this.add.text(width / 2, 154, '', {
      fontFamily: 'system-ui', fontSize: '16px', color: '#fff4d6',
      backgroundColor: '#293e34', padding: { x: 16, y: 10 },
      wordWrap: { width: width - 96 }, align: 'center',
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(1000);
    const main = this.scene.get('main');
    const onNotify = (message: string) => this.showToast(message);
    main.events.on('notify', onNotify);
    this.mini = new Minimap(this, this.miniData);
    this.inventory = new InventoryView(this);
    this.hotbar = this.add.container(width / 2 - 264, height - STATUS_HEIGHT - 66).setDepth(10);
    this.slots = [];
    ['호미', '물주기', '씨앗', '수확', '도끼', '낚싯대'].forEach((label, i) => {
      const x = i * 88;
      const box = this.add.rectangle(x, 0, 84, 58, 0x293e34, 0.95).setOrigin(0).setStrokeStyle(1, 0x8c9c6b);
      this.slots.push(box);
      this.hotbar.add(box);
      this.hotbar.add(this.add.text(x + 8, 6, `${i + 1}  ${label}`, { fontFamily: 'system-ui', fontSize: '13px', color: '#fff4d6' }));
      if (i === 2) {
        this.seedLabel = this.add.text(x + 8, 32, '', { fontFamily: 'system-ui', fontSize: '11px', color: '#fff4d6' });
        this.hotbar.add(this.seedLabel);
      }
    });
    const onMapKey = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const escape = event.code === 'Escape' || event.key === 'Escape';
      if (event.code === 'KeyI' || (escape && this.inventory.visible)) {
        if (!this.inventory.visible && !this.scene.isActive('main')) return;
        event.preventDefault(); event.stopPropagation();
        if (this.inventory.visible) {
          this.inventory.setVisible(false, this.miniData.state);
          this.scene.resume('main');
        } else {
          main.input.keyboard?.resetKeys();
          if (main.input.keyboard) main.input.keyboard.enabled = false;
          this.scene.pause('main');
          this.inventory.setVisible(true, this.miniData.state);
          this.toast.setAlpha(0);
        }
        return;
      }
      if (event.code !== 'KeyM' && !(escape && this.mini.bigVisible)) return;
      // Do not resume a main scene paused by a different modal.
      if (!this.mini.bigVisible && !this.scene.isActive('main')) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.mini.bigVisible) {
        this.mini.setBig(false);
        this.scene.resume('main');
      } else {
        main.input.keyboard?.resetKeys();
        if (main.input.keyboard) main.input.keyboard.enabled = false;
        this.scene.pause('main');
        this.mini.setBig(true);
        this.toast.setAlpha(0);
      }
    };
    window.addEventListener('keydown', onMapKey, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onMapKey, true);
      this.registry.events.off(`changedata-${STATUS_KEY}`, refresh);
      main.events.off('notify', onNotify);
      this.toastTimer?.remove(false);
      this.toastTimer = undefined;
      this.tweens.killTweensOf(this.toast);
    });
  }

  update() {
    this.mini.update();
    this.hotbar.setVisible(this.scene.isActive('main'));
    const selected = ['hoe', 'water', 'seed', 'harvest', 'axe', 'rod'].indexOf(this.getTool());
    this.slots.forEach((slot, index) => slot.setStrokeStyle(index === selected ? 3 : 1, index === selected ? 0xffe18a : 0x8c9c6b));
    const state = this.miniData.state;
    this.seedLabel.setText(`${CROPS[state.selectedSeed].name} ×${state.count(`seed:${state.selectedSeed}`)}`);
  }

  private showToast(message: string) {
    this.toastTimer?.remove(false);
    this.tweens.killTweensOf(this.toast);
    this.toast.setText(message).setAlpha(1);
    this.toastTimer = this.time.delayedCall(1800, () => {
      this.toastTimer = undefined;
      this.tweens.add({ targets: this.toast, alpha: 0, duration: 400 });
    });
  }
}

