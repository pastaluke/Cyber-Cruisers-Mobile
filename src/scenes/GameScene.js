/**
 * GameScene — the main game scene.
 *
 * Milestone 0 scope:
 *  ✓ Portrait 360 × 780 canvas, pixel-perfect
 *  ✓ Seeded procedural city tilemap
 *  ✓ Auto-accelerating Cruiser with ADAS raycast braking
 *  ✓ Hold-to-merge lane control + brake button
 *  ✓ 3-layer parallax (atmosphere / road / deep buildings)
 *  ✓ NPC traffic fleet
 *  ✓ HUD: minimap, speed, heading, brake indicator
 *  ✓ Touch zone guides (fade after start)
 */

import { CityGen, TILE_SIZE, WORLD_PX, WORLD_CHUNKS, CHUNK_TILES,
         ROAD_TILES, nsLaneCentreX, ewLaneCentreY } from '../systems/CityGen.js';
import { TrafficSystem }  from '../systems/TrafficSystem.js';
import { Cruiser }        from '../entities/Cruiser.js';
import { TouchControls }  from '../ui/TouchControls.js';
import { HUD }            from '../ui/HUD.js';
import { castRay }        from '../systems/RaycastSystem.js';
import vehicleData        from '../data/vehicles.json';

// ─── World constants ──────────────────────────────────────────────────────────
const GAME_SEED = 0x1337c0de; // constant seed → same city every run

// Player start: road group 8, northbound inner lane
const PLAYER_START_ROAD_G = 8;
const PLAYER_START_X      = nsLaneCentreX(PLAYER_START_ROAD_G, 'N', 0);
const PLAYER_START_Y      = ewLaneCentreY(PLAYER_START_ROAD_G, 'S', 0) + 160; // below centre intersection
const PLAYER_START_HEAD   = 'N';
const PLAYER_START_LANE   = 0;

// Heading → sprite angle (texture points UP = North)
const HEADING_ANGLE = { N: 0, E: 90, S: 180, W: -90 };

// Parallax scroll factors
const PARALLAX_DEEP  = 0.55; // slow — distant building facades
const PARALLAX_RAIN  = 1.20; // fast — atmosphere/rain layer

// Rain
const RAIN_COUNT   = 80;
const RAIN_SPEED_Y = 320; // px/s downward (world space)
const RAIN_ALPHA   = 0.25;

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────────────────────────────────
  create() {
    // ── City generation ─────────────────────────────────────────────────────
    this._cityGen  = new CityGen(GAME_SEED);
    this._cityData = this._cityGen.generate();

    // ── Parallax layer 1: deep building facades (behind road) ───────────────
    this._bgLayer = this._createBgLayer();

    // ── Tilemap (road plane) ────────────────────────────────────────────────
    this._createTilemap();

    // ── Rain layer (in front of road, behind sprites) ───────────────────────
    this._rainParticles = this._createRainLayer();

    // ── Player Cruiser ──────────────────────────────────────────────────────
    const courierClass = vehicleData.classes.find(c => c.id === 'courier');
    this._cruiser = new Cruiser(
      courierClass,
      PLAYER_START_X,
      PLAYER_START_Y,
      PLAYER_START_HEAD,
      PLAYER_START_LANE,
      PLAYER_START_ROAD_G,
    );

    this._playerSprite = this.add.image(PLAYER_START_X, PLAYER_START_Y, 'cruiser')
      .setOrigin(0.5, 0.5)
      .setDepth(10);

    // ── Traffic system ──────────────────────────────────────────────────────
    this._traffic = new TrafficSystem(this._cityData, 25);

    // ── NPC sprite pool ─────────────────────────────────────────────────────
    this._npcSprites = new Map(); // npcId → Phaser.GameObjects.Image

    // ── Camera ──────────────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, 0, WORLD_PX, WORLD_PX);
    this.cameras.main.startFollow(
      this._playerSprite,
      true,         // round pixels
      0.12, 0.12,   // lerp — smooth follow
    );

    // ── Touch controls ──────────────────────────────────────────────────────
    this._controls = new TouchControls(this, this._cruiser);

    // ── HUD ─────────────────────────────────────────────────────────────────
    this._hud = new HUD(this, WORLD_PX);
    this._hud.drawMinimapRoads(this._cityData);

    // ── Debug text (M0) ─────────────────────────────────────────────────────
    if (import.meta.env?.DEV) {
      this._debugText = this.add.text(4, 760, '', {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#446644',
      })
        .setScrollFactor(0)
        .setDepth(200);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    // ── Raycast: build entity list ──────────────────────────────────────────
    const playerEntity  = this._cruiser.toEntity();
    const allEntities   = this._traffic.buildEntityList(playerEntity);

    // ── Player brakeForce from raycast ──────────────────────────────────────
    const brakeForce = castRay(playerEntity, allEntities);

    // ── Update cruiser ──────────────────────────────────────────────────────
    this._cruiser.update(delta, brakeForce, this._cityGen);

    // ── Sync player sprite ──────────────────────────────────────────────────
    this._playerSprite.setPosition(this._cruiser.x, this._cruiser.y);
    this._playerSprite.setAngle(HEADING_ANGLE[this._cruiser.heading] ?? 0);

    // ── Update traffic ──────────────────────────────────────────────────────
    this._traffic.update(delta, this._cruiser.x, this._cruiser.y);
    this._syncNPCSprites();

    // ── Parallax layers ─────────────────────────────────────────────────────
    this._updateParallax();

    // ── Rain ────────────────────────────────────────────────────────────────
    this._updateRain(delta);

    // ── Touch controls ──────────────────────────────────────────────────────
    this._controls.update(delta);

    // ── HUD ─────────────────────────────────────────────────────────────────
    this._hud.update(this._cruiser);

    // ── Debug ────────────────────────────────────────────────────────────────
    if (this._debugText) {
      const c = this._cruiser;
      this._debugText.setText(
        `x:${Math.round(c.x)} y:${Math.round(c.y)} ` +
        `h:${c.heading} spd:${Math.round(c.speed)} bf:${brakeForce.toFixed(2)} ` +
        `npcs:${this._traffic.getNPCs().length}`
      );
    }
  }

  // ─── Tilemap ───────────────────────────────────────────────────────────────

  _createTilemap() {
    const map = this.make.tilemap({
      data:       this._cityData.tiles,
      tileWidth:  TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    // 'tileset' texture was generated in BootScene
    // firstgid=1 so data value 1 → frame 0, 2 → frame 1, etc.
    const tileset = map.addTilesetImage('tileset', 'tileset', TILE_SIZE, TILE_SIZE, 0, 0, 1);
    const layer   = map.createLayer(0, tileset, 0, 0);
    layer.setDepth(1);

    this._tilemap = map;
    this._tilemapLayer = layer;
  }

  // ─── Background parallax layer (deep building facades) ────────────────────

  _createBgLayer() {
    // A large Graphics drawn once at world coordinates but scrolled at
    // a fraction of camera speed to simulate depth.
    // We cover the entire world at scroll factor PARALLAX_DEEP.
    const g = this.add.graphics();
    g.setScrollFactor(PARALLAX_DEEP);
    g.setDepth(0);

    // Fill with a deep colour
    g.fillStyle(0x060611, 1);
    g.fillRect(0, 0, WORLD_PX, WORLD_PX);

    // Draw subtle building silhouettes at a coarser grid
    const SLAB = CHUNK_TILES * TILE_SIZE;  // 224px per chunk
    for (let gy = 0; gy < WORLD_CHUNKS; gy++) {
      for (let gx = 0; gx < WORLD_CHUNKS; gx++) {
        const district = this._cityData.districtMap[gy][gx];
        const colors   = [0x1a0a2e, 0x2a1408, 0x0a0820, 0x08101e, 0x08100a];
        const col      = colors[district];

        // Building block area within chunk (skip road tiles)
        const bx = gx * SLAB + ROAD_TILES * TILE_SIZE;
        const by = gy * SLAB + ROAD_TILES * TILE_SIZE;
        const bw = SLAB - ROAD_TILES * TILE_SIZE;

        g.fillStyle(col, 1);
        g.fillRect(bx, by, bw, bw);

        // Subtle facade windows
        const glows = [0x440033, 0x331100, 0x001133, 0x001122, 0x002200];
        g.fillStyle(glows[district], 0.6);
        for (let wi = 0; wi < 5; wi++) {
          const wx = bx + ((gx * 7 + wi * 3) % (bw - 6));
          const wy = by + ((gy * 11 + wi * 5) % (bw - 6));
          g.fillRect(wx, wy, 3, 3);
        }
      }
    }

    return g;
  }

  // ─── Rain layer ────────────────────────────────────────────────────────────

  _createRainLayer() {
    // Simple custom rain: array of {x, y, len, speed} particles
    // Rendered as lines each frame onto a Graphics object fixed to camera.
    this._rainGfx = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(8);

    const particles = [];
    for (let i = 0; i < RAIN_COUNT; i++) {
      particles.push({
        x:     Math.random() * 360,
        y:     Math.random() * 780,
        len:   4 + Math.random() * 6,
        speed: RAIN_SPEED_Y * (0.7 + Math.random() * 0.6),
        alpha: 0.1 + Math.random() * 0.2,
      });
    }
    return particles;
  }

  _updateRain(delta) {
    const dt  = delta / 1000;
    const g   = this._rainGfx;
    g.clear();

    for (const p of this._rainParticles) {
      // Move (screen space — fixed to camera)
      p.y += p.speed * dt;
      if (p.y > 780) {
        p.y = -p.len;
        p.x = Math.random() * 360;
      }

      g.lineStyle(1, 0x88aacc, p.alpha * RAIN_ALPHA);
      g.lineBetween(p.x, p.y, p.x - 1, p.y + p.len);
    }
  }

  // ─── NPC sprite pool ───────────────────────────────────────────────────────

  _syncNPCSprites() {
    const npcs   = this._traffic.getNPCs();
    const liveIds = new Set(npcs.map(n => n.id));

    // Remove sprites for despawned NPCs
    for (const [id, sprite] of this._npcSprites) {
      if (!liveIds.has(id)) {
        sprite.destroy();
        this._npcSprites.delete(id);
      }
    }

    // Create / update sprites for live NPCs
    for (const npc of npcs) {
      let sprite = this._npcSprites.get(npc.id);
      if (!sprite) {
        sprite = this.add.image(npc.x, npc.y, 'npc_cruiser')
          .setOrigin(0.5, 0.5)
          .setDepth(9)
          .setTint(npc.color);
        this._npcSprites.set(npc.id, sprite);
      }
      sprite.setPosition(npc.x, npc.y);
      sprite.setAngle(HEADING_ANGLE[npc.heading] ?? 0);
    }
  }

  // ─── Parallax update ───────────────────────────────────────────────────────

  _updateParallax() {
    // Phaser's setScrollFactor handles the road plane automatically (factor 1).
    // The bg layer (PARALLAX_DEEP) and rain (PARALLAX_RAIN fixed to screen)
    // are already handled by their scrollFactor settings.
    // No manual update needed — Phaser does it automatically.
  }
}
