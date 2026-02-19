/**
 * BootScene — generates all programmatic textures and starts GameScene.
 *
 * Because Cyber Cruisers targets zero-external-asset M0, every tile and
 * sprite is drawn with Phaser's Graphics API and baked into a texture.
 *
 * Tileset layout (128 × 16 px, 8 tiles of 16 × 16 each):
 *
 *   Frame 0 — Road N-S   (vertical road)
 *   Frame 1 — Road E-W   (horizontal road)
 *   Frame 2 — Intersection
 *   Frame 3 — Building: Neon Commercial
 *   Frame 4 — Building: Industrial Port
 *   Frame 5 — Building: Residential Stack
 *   Frame 6 — Building: Corp Arcology
 *   Frame 7 — Building: Outer Ring
 */

import { TILE_SIZE } from '../systems/CityGen.js';

const ROAD_DARK       = 0x111122;
const ROAD_LINE       = 0x223344;
const INTERSECT_COLOR = 0x0d0d1a;

// Building base colours per district (matches districts.json palette roughly)
const BLDG_COLORS = [
  0x1a0a2e,  // Neon Commercial — deep purple
  0x2a1a08,  // Industrial Port — dark amber
  0x0a0a2a,  // Residential Stack — deep navy
  0x08101e,  // Corp Arcology — very dark blue-grey
  0x081208,  // Outer Ring — very dark green
];

// Window / accent glow colours
const BLDG_GLOW = [
  0xff00ff,
  0xff8800,
  0x4488ff,
  0x00ddff,
  0x44cc44,
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    this._createTileset();
    this._createCruiserTexture();
    this._createNPCTexture();
    this.scene.start('GameScene');
  }

  // ─── Tileset (8 tiles × 16 px wide, 16 px tall) ──────────────────────────

  _createTileset() {
    const ts   = TILE_SIZE;
    const cols = 8;
    const g    = this.make.graphics({ x: 0, y: 0, add: false });

    // Frame 0 — Road N-S
    this._drawRoadNS(g, 0 * ts, 0, ts);

    // Frame 1 — Road E-W
    this._drawRoadEW(g, 1 * ts, 0, ts);

    // Frame 2 — Intersection
    this._drawIntersection(g, 2 * ts, 0, ts);

    // Frames 3-7 — Buildings
    for (let i = 0; i < 5; i++) {
      this._drawBuilding(g, (3 + i) * ts, 0, ts, BLDG_COLORS[i], BLDG_GLOW[i]);
    }

    g.generateTexture('tileset', cols * ts, ts);
    g.destroy();
  }

  _drawRoadNS(g, ox, oy, ts) {
    g.fillStyle(ROAD_DARK, 1);
    g.fillRect(ox, oy, ts, ts);
    // Subtle lane markings (centre-line dashes for a 2-lane road)
    g.fillStyle(ROAD_LINE, 1);
    g.fillRect(ox + ts / 2 - 1, oy,     2, ts / 3);
    g.fillRect(ox + ts / 2 - 1, oy + ts * 2 / 3, 2, ts / 3);
    // Edge lines
    g.fillRect(ox,          oy, 1, ts);
    g.fillRect(ox + ts - 1, oy, 1, ts);
  }

  _drawRoadEW(g, ox, oy, ts) {
    g.fillStyle(ROAD_DARK, 1);
    g.fillRect(ox, oy, ts, ts);
    // Horizontal centre-line dashes
    g.fillStyle(ROAD_LINE, 1);
    g.fillRect(ox,               oy + ts / 2 - 1, ts / 3,       2);
    g.fillRect(ox + ts * 2 / 3, oy + ts / 2 - 1, ts / 3,       2);
    // Edge lines
    g.fillRect(ox, oy,          ts, 1);
    g.fillRect(ox, oy + ts - 1, ts, 1);
  }

  _drawIntersection(g, ox, oy, ts) {
    g.fillStyle(INTERSECT_COLOR, 1);
    g.fillRect(ox, oy, ts, ts);
    // Faint corner markers
    g.fillStyle(ROAD_LINE, 0.5);
    g.fillRect(ox,          oy,          2, 2);
    g.fillRect(ox + ts - 2, oy,          2, 2);
    g.fillRect(ox,          oy + ts - 2, 2, 2);
    g.fillRect(ox + ts - 2, oy + ts - 2, 2, 2);
  }

  _drawBuilding(g, ox, oy, ts, base, glow) {
    // Base fill
    g.fillStyle(base, 1);
    g.fillRect(ox, oy, ts, ts);
    // Subtle top edge (rooftop border)
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(ox, oy, ts, 1);
    g.fillRect(ox, oy, 1, ts);
    // Occasional window glow (deterministic from ox)
    const wCol = (ox / ts) % 2 === 0 ? 4 : 10;
    const wRow = (ox / ts) % 3 === 0 ? 4 : 8;
    g.fillStyle(glow, 0.4);
    g.fillRect(ox + wCol, oy + wRow, 2, 2);
    if ((ox / ts) % 3 !== 1) {
      g.fillRect(ox + wCol + 5, oy + wRow + 4, 2, 2);
    }
  }

  // ─── Player Cruiser sprite (10 × 14 px baked to texture) ─────────────────

  _createCruiserTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const w = 10, h = 14;

    // Body — cyan/teal
    g.fillStyle(0x00ccff, 1);
    g.fillTriangle(w / 2, 0, 0, h, w, h);

    // Cockpit highlight
    g.fillStyle(0xaaeeff, 0.6);
    g.fillTriangle(w / 2, 3, 3, h - 3, w - 3, h - 3);

    // Engine glow at tail
    g.fillStyle(0xff6600, 0.85);
    g.fillRect(3, h - 3, 4, 3);

    g.generateTexture('cruiser', w, h);
    g.destroy();
  }

  // ─── NPC Cruiser sprite ───────────────────────────────────────────────────

  _createNPCTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const w = 8, h = 12;

    g.fillStyle(0xff8800, 1);
    g.fillTriangle(w / 2, 0, 0, h, w, h);

    g.fillStyle(0xffcc88, 0.5);
    g.fillTriangle(w / 2, 3, 2, h - 3, w - 2, h - 3);

    g.fillStyle(0x0088ff, 0.85);
    g.fillRect(2, h - 3, 4, 3);

    g.generateTexture('npc_cruiser', w, h);
    g.destroy();
  }
}
