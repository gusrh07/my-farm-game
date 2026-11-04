import Phaser from 'phaser';
import { map, COLS, ROWS, TILE_SIZE } from './world';
import { BUILDING_DEFS } from './buildings';
import type { GameState } from './state';

export interface MinimapData {
  state: GameState;
  player: { x: number; y: number };
  camera: Phaser.Cameras.Scene2D.Camera;
}
const S = 3;
const COLORS = [0x79a75a, 0x3a8fd9, 0x8d6e63, 0xc49b66];
export class Minimap {
  private layer: Phaser.GameObjects.Container;
  private dynamic: Phaser.GameObjects.Graphics;
  private big: Phaser.GameObjects.Container;
  private bigDynamic: Phaser.GameObjects.Graphics;
  bigVisible = false;

  constructor(private scene: Phaser.Scene, private data: MinimapData) {
    const w = COLS * S, h = ROWS * S;
    const key = 'farm-minimap-terrain';
    if (!scene.textures.exists(key)) {
      const terrain = scene.add.graphics();
      for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        terrain.fillStyle(COLORS[map[row][col]]).fillRect(col * S, row * S, S, S);
      }
      terrain.generateTexture(key, w, h);
      terrain.destroy();
    }
    this.layer = scene.add.container(scene.scale.width - w - 16, 28).setDepth(120);
    this.layer.add(scene.add.rectangle(-6, -22, w + 12, h + 28, 0x293e34, 0.95).setOrigin(0));
    this.layer.add(scene.add.text(0, -18, '농장 지도 · M', { fontFamily: 'system-ui', fontSize: '11px', color: '#fff4d6' }));
    this.layer.add(scene.add.image(0, 0, key).setOrigin(0));
    this.dynamic = scene.add.graphics();
    this.layer.add(this.dynamic);
    const bw = COLS * 10, bh = ROWS * 10;
    const x = (scene.scale.width - bw) / 2, y = (scene.scale.height - bh) / 2;
    this.big = scene.add.container(x, y).setDepth(100).setVisible(false);
    this.big.add(scene.add.rectangle(-x, -y, scene.scale.width, scene.scale.height, 0x17251a, 0.65).setOrigin(0));
    this.big.add(scene.add.rectangle(-12, -38, bw + 24, bh + 80, 0x293e34).setOrigin(0).setStrokeStyle(2, 0xa5b985));
    this.big.add(scene.add.text(0, -28, '농장 전체 지도', { fontSize: '18px', color: '#fff4d6' }));
    this.big.add(scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(bw, bh));
    this.bigDynamic = scene.add.graphics();
    this.big.add(this.bigDynamic);
    this.big.add(scene.add.text(0, bh + 12, '흰 점: 현재 위치 · 흰 테두리: 시야     M / Esc 닫기', {
      fontFamily: 'system-ui', fontSize: '13px', color: '#fff4d6',
    }));
  }

  setBig(visible: boolean) {
    this.bigVisible = visible;
    this.big.setVisible(visible);
    this.update();
  }

  update() {
    this.drawDynamic(this.dynamic, S);
    if (this.bigVisible) this.drawDynamic(this.bigDynamic, 10);
  }

  private drawDynamic(g: Phaser.GameObjects.Graphics, S: number) {
    const { state, player, camera } = this.data;
    g.clear();
    for (const p of state.props) {
      g.fillStyle(p.type === 'sapling' ? 0xa6cc63 : 0x245331).fillRect(p.tx * S, p.ty * S, S, S);
    }
    for (const [key, soil] of state.field.entries()) {
      const [col, row] = key.split(',').map(Number);
      g.fillStyle(soil.crop ? 0xffeb3b : 0x5d4037).fillRect(col * S, row * S, S, S);
    }
    for (const b of state.buildings) {
      const d = BUILDING_DEFS[b.type];
      g.fillStyle(0x593c2a).fillRect(b.tx * S, b.ty * S, d.w * S, d.h * S);
      g.fillStyle(0xf6d693).fillRect((b.tx + d.doorDx) * S, (b.ty + d.doorDy) * S, S, S);
    }
    const view = camera.worldView;
    for (const chest of state.chests) g.fillStyle(0xefb54b).fillRect(chest.tx * S, chest.ty * S, S, S);
    const left = Math.max(0, view.x / TILE_SIZE * S);
    const top = Math.max(0, view.y / TILE_SIZE * S);
    const right = Math.min(COLS * S, view.right / TILE_SIZE * S);
    const bottom = Math.min(ROWS * S, view.bottom / TILE_SIZE * S);
    g.lineStyle(1, 0xffffff, 0.8).strokeRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    const dot = Math.max(3, S / 2);
    g.fillStyle(0xffffff, Math.floor(this.scene.time.now / 300) % 2 === 0 ? 1 : 0.3)
      .fillRect(player.x / TILE_SIZE * S - dot / 2, player.y / TILE_SIZE * S - dot / 2, dot, dot);
  }
}
