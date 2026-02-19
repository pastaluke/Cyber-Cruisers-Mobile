/**
 * HUD — always-visible heads-up display.
 *
 * Elements:
 *  - Mini-map (top-left, shows roads + player dot)
 *  - Speed readout (top-right)
 *  - Brake button indicator (bottom centre) — lights up when brake active
 *  - Touch zone guide (subtle overlays, fade out after first interaction)
 *  - Heading arrow (near player sprite on screen)
 *
 * All elements have scrollFactor(0) — they stay fixed to the camera.
 */

const FONT_MONO = { fontFamily: 'monospace', color: '#00ffcc' };

const MINIMAP_X    = 12;
const MINIMAP_Y    = 12;
const MINIMAP_W    = 80;
const MINIMAP_H    = 80;
const MINIMAP_ALPHA = 0.82;

export class HUD {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} worldPx — total world size in pixels
   */
  constructor(scene, worldPx) {
    this.scene   = scene;
    this.worldPx = worldPx;

    const depth = 100; // above everything

    // ── Mini-map background ─────────────────────────────────────────────────
    this._minimapBg = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(depth);

    this._minimapBg
      .fillStyle(0x000011, 0.75)
      .fillRoundedRect(MINIMAP_X - 2, MINIMAP_Y - 2, MINIMAP_W + 4, MINIMAP_H + 4, 4)
      .lineStyle(1, 0x00ffcc, 0.5)
      .strokeRoundedRect(MINIMAP_X - 2, MINIMAP_Y - 2, MINIMAP_W + 4, MINIMAP_H + 4, 4);

    // ── Mini-map road layer (drawn once in create) ──────────────────────────
    this._minimapRoads = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(depth + 1);

    // ── Mini-map player dot ─────────────────────────────────────────────────
    this._minimapPlayer = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(depth + 2);

    // ── Speed readout ───────────────────────────────────────────────────────
    this._speedText = scene.add.text(348, 14, '000', {
      ...FONT_MONO,
      fontSize: '11px',
      align: 'right',
    })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    this._speedLabel = scene.add.text(348, 26, 'km/h', {
      ...FONT_MONO,
      fontSize: '8px',
      color: '#008866',
      align: 'right',
    })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // ── Brake button ────────────────────────────────────────────────────────
    this._brakeGfx = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(depth);

    this._brakeText = scene.add.text(180, 752, 'BRAKE', {
      ...FONT_MONO,
      fontSize: '10px',
      color: '#445566',
      align: 'center',
    })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);

    this._drawBrakeButton(false);

    // ── Touch zone guides (fade out) ────────────────────────────────────────
    this._zoneGuides = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(depth - 1)
      .setAlpha(0.25);

    this._drawZoneGuides();

    // Fade out zone guides after 3 seconds
    scene.tweens.add({
      targets: this._zoneGuides,
      alpha: 0,
      duration: 1500,
      delay: 2500,
      ease: 'Sine.easeIn',
    });

    // ── Heading indicator ───────────────────────────────────────────────────
    this._headingText = scene.add.text(12, 100, 'N ↑', {
      ...FONT_MONO,
      fontSize: '9px',
      color: '#445566',
    })
      .setScrollFactor(0)
      .setDepth(depth);
  }

  // ─── Called once after city is generated ───────────────────────────────────
  drawMinimapRoads(cityData) {
    const g   = this._minimapRoads;
    const scl = MINIMAP_W / this.worldPx; // world → minimap scale

    g.clear();
    g.fillStyle(0x003322, 1);

    const { nsRoads, ewRoads } = cityData;
    const ROAD_W = Math.max(1, Math.round(4 * 16 * scl)); // road tile width on minimap

    // N-S roads
    g.fillStyle(0x114422, 1);
    for (const r of nsRoads) {
      const mx = MINIMAP_X + r.worldX * scl;
      g.fillRect(mx, MINIMAP_Y, ROAD_W, MINIMAP_H);
    }

    // E-W roads
    for (const r of ewRoads) {
      const my = MINIMAP_Y + r.worldY * scl;
      g.fillRect(MINIMAP_X, my, MINIMAP_W, ROAD_W);
    }
  }

  // ─── Called each frame ─────────────────────────────────────────────────────
  update(cruiser) {
    // Speed display (convert px/s to a fictional km/h unit)
    const kmh = Math.round(cruiser.speed * 0.6);
    this._speedText.setText(String(kmh).padStart(3, '0'));

    // Minimap player dot
    const scl = MINIMAP_W / this.worldPx;
    const mx  = MINIMAP_X + cruiser.x * scl;
    const my  = MINIMAP_Y + cruiser.y * scl;

    this._minimapPlayer.clear();
    this._minimapPlayer.fillStyle(0x00ffcc, 1);
    this._minimapPlayer.fillCircle(mx, my, 2);

    // Brake button
    this._drawBrakeButton(cruiser._manualBrake);

    // Heading indicator
    const arrowMap = { N: '↑', S: '↓', E: '→', W: '←' };
    this._headingText.setText(`${cruiser.heading} ${arrowMap[cruiser.heading] ?? ''}`);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _drawBrakeButton(active) {
    const g = this._brakeGfx;
    g.clear();
    const col   = active ? 0xff4400 : 0x112233;
    const alpha = active ? 0.9 : 0.45;
    g.fillStyle(col, alpha);
    g.fillRoundedRect(104, 736, 152, 32, 8);
    g.lineStyle(1, active ? 0xff8844 : 0x224455, 0.8);
    g.strokeRoundedRect(104, 736, 152, 32, 8);

    this._brakeText.setStyle({
      color: active ? '#ffcc88' : '#445566',
    });
  }

  _drawZoneGuides() {
    const g = this._zoneGuides;
    // Left zone
    g.fillStyle(0x0044ff, 0.08);
    g.fillRect(0, 0, 120, 780);
    g.lineStyle(1, 0x0044ff, 0.3);
    g.lineBetween(120, 0, 120, 780);

    // Right zone
    g.fillStyle(0x0044ff, 0.08);
    g.fillRect(240, 0, 120, 780);
    g.lineStyle(1, 0x0044ff, 0.3);
    g.lineBetween(240, 0, 240, 780);

    // Brake zone outline
    g.lineStyle(1, 0xff4400, 0.4);
    g.strokeRoundedRect(104, 736, 152, 32, 8);

    // Labels
    this.scene.add.text(60, 390, '←\nLANE', {
      ...FONT_MONO,
      fontSize: '8px',
      color: '#224488',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(99).setAlpha(0.4);

    this.scene.add.text(300, 390, '→\nLANE', {
      ...FONT_MONO,
      fontSize: '8px',
      color: '#224488',
      align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(99).setAlpha(0.4);
  }
}
