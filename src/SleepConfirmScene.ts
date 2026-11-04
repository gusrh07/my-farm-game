import { audio } from './audio';
import Phaser from 'phaser';

export class SleepConfirmScene extends Phaser.Scene {
  private answered = false;
  constructor() { super('sleepConfirm'); }

  create() {
    this.answered = false;
    audio.play('ui');
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x17251a, 0.55);
    this.add.rectangle(width / 2, height / 2, 420, 160, 0xf6efd6).setStrokeStyle(2, 0x8c9c6b);
    this.add.text(width / 2, height / 2 - 38, '잠자리에 들까요?', {
      fontFamily: 'system-ui', fontSize: '22px', color: '#354b38',
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 + 10, '다음 날 06:00 · 에너지 모두 회복\nY / Space 자기     N / Esc 취소', {
      fontFamily: 'system-ui', fontSize: '15px', color: '#607052', align: 'center', lineSpacing: 12,
    }).setOrigin(0.5);
    // Native capture also handles environments where Escape never reaches Phaser.
    const onKey = (event: KeyboardEvent) => {
      const key = event.code || event.key;
      const yes = ['KeyY', 'y', 'Y', 'Space', ' '].includes(key);
      const no = ['KeyN', 'n', 'N', 'Escape', 'Esc'].includes(key);
      if ((!yes && !no) || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.answer(yes);
    };
    window.addEventListener('keydown', onKey, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('keydown', onKey, true));
  }

  private answer(sleep: boolean) {
    if (this.answered) return;
    this.answered = true;
    if (sleep) this.scene.get('main').events.emit('sleep-voluntary');
    this.scene.resume('main');
    this.scene.stop();
  }
}

