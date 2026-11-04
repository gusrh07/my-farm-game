import Phaser from 'phaser';
import { mountMenu, heading, button, status, settings } from './menuUi';
export class PauseScene extends Phaser.Scene {
  private panel!: HTMLElement;
  private save!: () => boolean;
  private title!: () => void;
  private cleanupSettings?: () => void;
  constructor() { super('pauseMenu'); }
  init(data: { save: () => boolean; title: () => void }) { this.save = data.save; this.title = data.title; }
  create() {
    this.panel = mountMenu(this);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat) return;
      e.preventDefault(); e.stopPropagation();
      if (this.cleanupSettings) this.home(); else this.close();
    };
    window.addEventListener('keydown', onKey, true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.cleanupSettings?.(); this.cleanupSettings = undefined; window.removeEventListener('keydown', onKey, true); });
    this.home();
  }
  private home() {
    this.cleanupSettings?.(); this.cleanupSettings = undefined;
    heading(this.panel, '잠시 쉬어가기', '게임 시간이 멈췄습니다.');
    button(this.panel, '계속하기 · Esc', () => this.close());
    button(this.panel, '저장', () => { message.textContent = this.save() ? '저장했습니다.' : '저장에 실패했습니다. 게임은 유지됩니다.'; });
    button(this.panel, '설정', () => { this.cleanupSettings = settings(this.panel, () => this.home()); });
    button(this.panel, '저장 후 타이틀로', () => {
      if (this.save()) { this.title(); this.scene.stop(); }
      else message.textContent = '저장에 실패해 타이틀로 이동하지 않았습니다.';
    });
    const message = status(this.panel);
  }
  private close() { this.scene.resume('main'); this.scene.stop(); }
}
