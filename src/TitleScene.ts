import Phaser from 'phaser';
import { GameState } from './state';
import { SAVE_KEY, readSave, writeSave } from './save';
import { mountMenu, heading, button, status, settings } from './menuUi';
export class TitleScene extends Phaser.Scene {
  private panel!: HTMLElement;
  private cleanupSettings?: () => void;
  constructor() { super('title'); }
  create() {
    this.panel = mountMenu(this);
    document.querySelector('#farm-status')!.textContent = '작은 계절 농장 · 이어하기 또는 새 게임을 선택하세요.';
    document.querySelectorAll<HTMLButtonElement>('#save-game, #load-game').forEach(b => b.disabled = true);
    const onEscape = (e: KeyboardEvent) => { if (e.code === 'Escape') this.home(); };
    window.addEventListener('keydown', onEscape);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.cleanupSettings?.(); window.removeEventListener('keydown', onEscape); });
    this.home();
  }
  private home() {
    this.cleanupSettings?.(); this.cleanupSettings = undefined;
    heading(this.panel, '작은 계절 농장', '씨앗을 심고, 계절을 보내며 나만의 농장을 가꿔 보세요.');
    let hasSave = false, storageError = false;
    try { hasSave = localStorage.getItem(SAVE_KEY) !== null; } catch { storageError = true; }
    button(this.panel, '이어하기', () => {
      try { const state = readSave(); if (!state) throw new Error(); this.scene.start('main', { state }); }
      catch { message.textContent = '저장을 불러오지 못했습니다. 기존 저장은 유지됩니다.'; }
    }, !hasSave);
    button(this.panel, '새 게임', () => {
      if (hasSave) this.confirmNew();
      else this.startNew();
    }, storageError);
    button(this.panel, '설정', () => { this.cleanupSettings = settings(this.panel, () => this.home()); });
    button(this.panel, '크레딧', () => {
      heading(this.panel, '크레딧', '픽셀 아트: Sunnyside World · Daniel Diggle');
      const link = document.createElement('a');
      link.href = 'https://danieldiggle.itch.io/sunnyside';
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Sunnyside World 공식 페이지';
      this.panel.append(link);
      const sound = document.createElement('p');
      sound.textContent = '효과음·빗소리: 게임 코드에서 합성한 소리. 외부 음원은 사용하지 않았습니다.';
      this.panel.append(sound);
      button(this.panel, '뒤로', () => this.home());
    });
    const message = status(this.panel);
    if (storageError) message.textContent = '브라우저 저장 공간에 접근할 수 없습니다. 저장 권한을 확인하세요.';
  }
  private confirmNew() {
    heading(this.panel, '새로 시작할까요?', '기존 농장 저장을 지우고 새 농장으로 바꿉니다. 이전 진행은 되돌릴 수 없습니다.');
    button(this.panel, '기존 저장을 지우고 새 게임', () => this.startNew());
    button(this.panel, '취소', () => this.home());
  }
  private startNew() {
    try {
      const state = new GameState();
      // Replace in one write, rather than deleting the old slot before saving.
      writeSave(state);
      this.scene.start('main', { state });
    } catch { status(this.panel).textContent = '새 게임을 저장하지 못했습니다. 저장 공간을 확인하세요.'; }
  }
}
