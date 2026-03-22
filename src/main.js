/**
 * Cyber Cruisers — main entry point.
 *
 * Canvas: 360 × 780 logical pixels (portrait)
 * Pixel art scale: 4× CSS pixels → 1440 × 3120 on Samsung S23 Ultra native res
 *
 * The game is built with Phaser 3 + Vite and ships as a PWA.
 */

import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const CANVAS_W = 360;
const CANVAS_H = 780;

// ─── Phaser config ────────────────────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,

  width:           CANVAS_W,
  height:          CANVAS_H,
  backgroundColor: '#0a0a1a',

  // Scale to fill device screen while preserving aspect ratio
  scale: {
    mode:        Phaser.Scale.FIT,
    autoCenter:  Phaser.Scale.CENTER_BOTH,
    parent:      'game-container',
  },

  // Crisp pixel art — no anti-aliasing
  render: {
    antialias:        false,
    pixelArt:         true,
    roundPixels:      true,
  },

  // Scenes run in order; BootScene hands off to GameScene
  scene: [BootScene, GameScene],

  // Touch input
  input: {
    activePointers: 3, // multi-touch (up to 3 fingers)
  },
};

// ─── Launch ───────────────────────────────────────────────────────────────────
const game = new Phaser.Game(config);

// Expose for debugging in dev
if (import.meta.env?.DEV) {
  window.__CC_GAME__ = game;
}
