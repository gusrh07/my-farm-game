import Phaser from 'phaser';
import { audio } from './audio';

export function mountMenu(scene: Phaser.Scene) {
  const overlay = document.createElement('div'); overlay.className = 'game-menu';
  const panel = document.createElement('section'); panel.className = 'menu-panel';
  overlay.append(panel); document.querySelector('#game')!.append(overlay);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => overlay.remove());
  return panel;
}
export function heading(panel: HTMLElement, title: string, subtitle: string) {
  panel.replaceChildren();
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = subtitle;
  panel.append(h, p);
}
export function button(panel: HTMLElement, label: string, action: () => void, disabled = false) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled;
  b.onclick = () => { audio.play('ui'); action(); };
  panel.append(b);
  return b;
}
export function status(panel: HTMLElement) {
  const p = document.createElement('p'); p.className = 'menu-status'; p.setAttribute('role', 'status'); panel.append(p); return p;
}
export function settings(panel: HTMLElement, back: () => void) {
  heading(panel, '설정', '효과음과 빗소리의 볼륨을 함께 조절합니다.');
  const label = document.createElement('label');
  const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1'; slider.value = String(Math.round(audio.settings.volume * 100));
  slider.setAttribute('aria-label', '효과음 볼륨');
  const value = document.createElement('span'); value.textContent = `효과음 볼륨 ${slider.value}%`;
  label.append(value, slider); panel.append(label);
  const mute = button(panel, '', () => {
    const ok = audio.setMuted(!audio.settings.muted);
    message.textContent = ok ? '설정을 저장했습니다.' : '현재 적용됐지만 설정 저장에 실패했습니다.';
    refresh();
  });
  const refresh = () => { mute.textContent = audio.settings.muted ? '음소거: 켜짐 (눌러서 소리 켜기)' : '음소거: 꺼짐 (눌러서 소리 끄기)'; };
  refresh();
  button(panel, '소리 미리 듣기', () => audio.play('harvest'));
  button(panel, '뒤로', back);
  const message = status(panel);
  slider.oninput = () => {
    value.textContent = `효과음 볼륨 ${slider.value}%`;
    message.textContent = audio.setVolume(Number(slider.value) / 100) ? '설정을 저장했습니다.' : '현재 적용됐지만 설정 저장에 실패했습니다.';
  };
  window.addEventListener('farm-mute', refresh);
  return () => window.removeEventListener('farm-mute', refresh);
}
