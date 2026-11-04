import Phaser from 'phaser';
import { map, TILE_SIZE, ROWS, COLS, type Facing } from './world';
import type { FarmField } from './farming';
import { CROPS } from './crops';
import type { ChestInstance } from './chests';

export function drawChests(scene: Phaser.Scene, group: Phaser.GameObjects.Group, chests: ChestInstance[]) {
  group.clear(true, true);
  for (const chest of chests) {
    const x = chest.tx * TILE_SIZE, y = chest.ty * TILE_SIZE;
    const g = scene.add.graphics().setDepth(100 + y + TILE_SIZE / 2);
    g.fillStyle(0x30291d, 0.25).fillEllipse(x + 16, y + 28, 30, 8);
    g.fillStyle(0xa56e38).fillRect(x + 3, y + 7, 26, 22);
    g.fillStyle(0xd7a45f).fillRect(x + 3, y + 4, 26, 10);
    g.lineStyle(2, 0x59412c).strokeRect(x + 3, y + 4, 26, 25);
    g.lineBetween(x + 3, y + 14, x + 29, y + 14);
    g.fillStyle(0xffd56c).fillRect(x + 13, y + 12, 6, 7);
    group.add(g);
  }
}
import { PROP_DEFS, type PropInstance } from './props';

export function drawProps(scene: Phaser.Scene, group: Phaser.GameObjects.Group, props: PropInstance[]) {
  group.clear(true, true);
  for (const p of props) {
    const d = PROP_DEFS[p.type];
    const x = (p.tx + 0.5) * TILE_SIZE, y = (p.ty + 0.5) * TILE_SIZE;
    group.add(scene.add.image(x, y + TILE_SIZE / 2, d.sprite, 0)
      .setOrigin(0.5, 1).setScale(p.type === 'sapling' ? 0.7 : 2).setDepth(100 + y));
  }
}
import { BUILDING_DEFS, type BuildingInstance } from './buildings';

export function drawBuildings(scene: Phaser.Scene, buildings: BuildingInstance[]) {
  for (const b of buildings) {
    const d = BUILDING_DEFS[b.type];
    const x = b.tx * TILE_SIZE, y = b.ty * TILE_SIZE;
    const w = d.w * TILE_SIZE, h = d.h * TILE_SIZE;
    // Temporary house: each visible wall follows the actual collision footprint.
    const g = scene.add.graphics().setDepth(100 + y);
    g.fillStyle(0xa67b53).fillRect(x, y, w, h);
    g.lineStyle(2, 0x57452f).strokeRect(x, y, w, h);
    g.fillStyle(0x70483d).fillRect(x, y, w, TILE_SIZE);
    g.lineStyle(2, 0x996452);
    for (let dy = 8; dy < TILE_SIZE; dy += 8) g.lineBetween(x, y + dy, x + w, y + dy);
    g.fillStyle(0xafd9ce).fillRect(x + 2.5 * TILE_SIZE, y + 1.25 * TILE_SIZE, 24, 20);
    g.fillStyle(0x453729).fillRect(x + d.doorDx * TILE_SIZE, y + d.doorDy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    scene.add.text(x + w / 2, y + 39, '집', { fontSize: '12px', color: '#fff0c8' }).setOrigin(0.5).setDepth(101 + y);
  }
}

// Rendering aliases only; crop IDs, prices, seasons and saves are unchanged.
// The source pack has no turnip/corn: radish/wheat are temporary visual substitutes.
export const CROP_ART: Record<string, string> = { turnip: 'radish', potato: 'potato', corn: 'wheat', pumpkin: 'pumpkin' };
const ROOT = `${import.meta.env.BASE_URL}assets/sunnyside/`;
type CharacterData = { tags: { name: string; frames: { frame: number; duration: number }[] }[] };

export function preloadArt(scene: Phaser.Scene) {
  scene.load.spritesheet('prop-tree', ROOT + 'tree.png', { frameWidth: 32, frameHeight: 34 });
  scene.load.spritesheet('land', ROOT + 'tiles.png', { frameWidth: 16, frameHeight: 16 });
  scene.load.spritesheet('farmer', ROOT + 'character.png', { frameWidth: 96, frameHeight: 64 });
  scene.load.json('farmer-tags', ROOT + 'character.json');
  for (const source of Object.values(CROP_ART)) {
    for (let stage = 0; stage <= 5; stage++) scene.load.image(`${source}-${stage}`, `${ROOT}${source}_0${stage}.png`);
  }
  scene.load.image('soil', ROOT + 'soil_01.png');
  for (const name of ['shovel', 'water', 'plant', 'basket']) scene.load.image(`icon-${name}`, `${ROOT}icon-${name}.png`);
}

export function createFarmerAnimations(scene: Phaser.Scene) {
  const data = scene.cache.json.get('farmer-tags') as CharacterData;
  for (const tag of data.tags) {
    if (!scene.anims.exists(tag.name)) scene.anims.create({
      key: tag.name, frames: tag.frames.map(frame => ({ key: 'farmer', frame: frame.frame })),
      frameRate: tag.name.startsWith('walk') ? 10 : 5, repeat: -1,
    });
  }
}

export function animateFarmer(player: Phaser.GameObjects.Sprite, facing: Facing, moving: boolean) {
  const suffix = facing === 'up' ? '-n' : facing === 'down' ? '-s' : '';
  player.setFlipX(facing === 'left');
  player.play(`${moving ? 'walk' : 'idle'}${suffix}`, true);
  player.setDepth(100 + player.y);
}

const frame = (x: number, y: number) => y * 64 + x;
export function drawTerrain(scene: Phaser.Scene) {
  const at = (col: number, row: number) => map[row]?.[col];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const tile = map[row][col];
    const x = col * TILE_SIZE, y = row * TILE_SIZE;
    const variation = (col * 17 + row * 31) % 9;
    scene.add.image(x, y, 'land', variation < 2 ? frame(1 + variation, 2) : frame(1, 1)).setOrigin(0).setScale(2);
    if (tile === 3) scene.add.image(x, y, 'land', frame(9 + col % 3, 7)).setOrigin(0).setScale(2);
    if (tile === 1) {
      scene.add.image(x, y, 'land', frame(11 + col % 4, 18 + row % 4)).setOrigin(0).setScale(2);
      const edge = scene.add.graphics().fillStyle(0xd1d889);
      if (at(col, row - 1) !== 1) edge.fillRect(x, y, 32, 3);
      if (at(col, row + 1) !== 1) edge.fillRect(x, y + 29, 32, 3);
      if (at(col - 1, row) !== 1) edge.fillRect(x, y, 3, 32);
      if (at(col + 1, row) !== 1) edge.fillRect(x + 29, y, 3, 32);
    }
    if (tile === 2) {
      const vertical = col === 0 || col === COLS - 1 || (col === 12 && row >= 8 && row <= 13);
      scene.add.ellipse(x + 16, y + 24, 27, 8, 0x26392b, 0.18);
      scene.add.image(x, y, 'land', vertical ? frame(40, 3) : frame(39, 1)).setOrigin(0).setScale(2).setDepth(100 + y + 16);
    }
    // Deterministic tiny ground flowers. Decoration never changes collision.
    if (tile === 0 && variation === 0 && (row < 3 || col > 21)) {
      scene.add.image(x + 18, y + 20, 'land', frame(32, 3)).setScale(1).setAlpha(0.85);
    }
  }
}

export function redrawField(scene: Phaser.Scene, group: Phaser.GameObjects.Group, field: FarmField) {
  group.clear(true, true);
  for (const [key, soil] of field.entries()) {
    const [col, row] = key.split(',').map(Number);
    const x = (col + 0.5) * TILE_SIZE, y = (row + 0.5) * TILE_SIZE;
    const patch = scene.add.image(x, y + 3, 'soil').setScale(2).setDepth(2);
    if (soil.watered) patch.setTint(0x88746d);
    group.add(patch);
    if (!soil.crop) continue;
    const progress = Math.min(1, soil.crop.daysGrown / CROPS[soil.crop.id].growDays);
    const stage = progress >= 1 ? 4 : Math.min(3, Math.floor(progress * 4));
    group.add(scene.add.ellipse(x, y + 8, 18, 6, 0x302d21, 0.2).setDepth(3));
    group.add(scene.add.image(x, y + 10, `${CROP_ART[soil.crop.id]}-${stage}`).setOrigin(0.5, 1).setScale(2).setDepth(100 + y));
    if (progress >= 1) {
      const marker = scene.add.text(x + 9, y - 23, '✦', { fontSize: '13px', color: '#ffe18a', stroke: '#5e4929', strokeThickness: 2 }).setDepth(100 + y + 1);
      group.add(marker);
    }
  }
}

