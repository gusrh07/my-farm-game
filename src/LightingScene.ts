import { audio } from './audio';
import Phaser from 'phaser';
import type { GameState } from './state';
import { lightAt } from './lighting';
import { STATUS_HEIGHT } from './UIScene';

// Kept below every UI scene, even when the toast UI is brought above the shop.
export class LightingScene extends Phaser.Scene {
  private state!: GameState;
  private light!: Phaser.GameObjects.Rectangle;
  private cloud!: Phaser.GameObjects.Rectangle;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private raining = false;
  constructor() { super('lighting'); }
  init(data: { state: GameState }) { this.state = data.state; }
  create() {
    const { width, height } = this.scale;
    const farmHeight = height - STATUS_HEIGHT;
    // Clip weather to the farm viewport, leaving the status bar untouched.
    this.cameras.main.setViewport(0, 0, width, farmHeight);
    this.light = this.add.rectangle(0, 0, width, farmHeight, 0, 0).setOrigin(0);
    this.cloud = this.add.rectangle(0, 0, width, farmHeight, 0x1a2230,
      this.state.weather === 'rain' ? 0.15 : 0).setOrigin(0).setDepth(1);
    if (!this.textures.exists('weather-raindrop')) {
      const graphics = this.add.graphics();
      graphics.fillStyle(0xaad4ff).fillRect(0, 0, 2, 10);
      graphics.generateTexture('weather-raindrop', 2, 10);
      graphics.destroy();
    }
    this.rain = this.add.particles(0, -20, 'weather-raindrop', {
      x: { min: 0, max: width + 100 },
      lifespan: 1250,
      speedY: { min: 500, max: 700 },
      speedX: { min: -80, max: -40 },
      rotate: 8,
      scale: { min: 0.8, max: 1.2 },
      alpha: { start: 0.45, end: 0.2 },
      quantity: 2,
      frequency: 20,
      maxParticles: 160,
      emitting: false,
    }).setDepth(2);
    this.raining = false;
    this.update();
  }
  update(_time = 0, delta = 0) {
    const { color, alpha } = lightAt(this.state.lightingMinutes);
    this.light.setFillStyle(color, alpha);
    const isRain = this.state.weather === 'rain';
    audio.setRain(isRain);
    if (isRain !== this.raining) {
      this.raining = isRain;
      if (isRain) this.rain.start();
      else this.rain.stop(true); // Loading sunny weather also removes existing drops.
    }
    const target = isRain ? 0.15 : 0;
    const blend = 1 - Math.exp(-Math.max(0, delta) / 300);
    this.cloud.setFillStyle(0x1a2230, this.cloud.fillAlpha + (target - this.cloud.fillAlpha) * blend);
  }
}

