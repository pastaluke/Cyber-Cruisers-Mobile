/**
 * TrafficSystem — manages the NPC Cruiser fleet.
 *
 * Responsibilities:
 *  - Spawn NPC Cruisers on road segments near the player
 *  - Despawn NPCs that are too far from the player
 *  - Update NPC positions each frame (move + raycast braking)
 *  - Expose an entity list for the RaycastSystem
 */

import {
  CHUNK_TILES, TILE_SIZE, ROAD_TILES, LANES_PER_DIR, WORLD_CHUNKS,
  nsLaneCentreX, ewLaneCentreY, nsRoadX, ewRoadY,
  WORLD_PX,
} from './CityGen.js';
import { castRay } from './RaycastSystem.js';

const SPAWN_RADIUS  = 800;  // px from player — spawn band outer edge
const DESPAWN_RADIUS = 1000; // px — remove beyond this
const MIN_SPAWN_DIST = 400;  // px — don't spawn too close

const BASE_SPEED      = 130; // px/s for a standard NPC
const SPEED_VARIANCE  = 60;  // ± px/s randomised per NPC
const ACCEL           = 80;  // px/s² — how quickly NPCs reach target speed

let _nextId = 1;

function makeId() { return `npc_${_nextId++}`; }

const HEADINGS    = ['N', 'S', 'E', 'W'];
const HEADING_OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

export class TrafficSystem {
  /**
   * @param {object} cityData  — output of CityGen.generate()
   * @param {number} maxNPCs   — maximum live NPC count
   */
  constructor(cityData, maxNPCs = 30) {
    this.nsRoads    = cityData.nsRoads;
    this.ewRoads    = cityData.ewRoads;
    this.maxNPCs    = maxNPCs;
    this.npcs       = new Map(); // id → npc state
    this._spawnCooldown = 0;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  update(delta, playerX, playerY) {
    const dt = delta / 1000;

    // Collect all entities for raycasting (player entity is added by GameScene)
    const entities = this._buildEntityList();

    // Despawn far NPCs
    for (const [id, npc] of this.npcs) {
      const dist = Math.hypot(npc.x - playerX, npc.y - playerY);
      if (dist > DESPAWN_RADIUS) this.npcs.delete(id);
    }

    // Spawn if under cap
    this._spawnCooldown -= dt;
    if (this._spawnCooldown <= 0 && this.npcs.size < this.maxNPCs) {
      this._trySpawn(playerX, playerY);
      this._spawnCooldown = 0.4 + Math.random() * 0.6;
    }

    // Move each NPC
    for (const npc of this.npcs.values()) {
      // Raycast braking
      const brakeForce = castRay(npc, entities);
      const targetSpeed = npc.baseSpeed * (1 - brakeForce);
      // Smooth acceleration toward target
      const diff = targetSpeed - npc.speed;
      npc.speed += Math.sign(diff) * Math.min(Math.abs(diff), ACCEL * dt);
      npc.speed  = Math.max(0, npc.speed);

      // Advance position
      this._moveNPC(npc, dt);

      // Wrap / despawn if off-world
      if (npc.x < 0 || npc.x > WORLD_PX || npc.y < 0 || npc.y > WORLD_PX) {
        this.npcs.delete(npc.id);
      }
    }
  }

  /** Return NPC list for rendering */
  getNPCs() { return Array.from(this.npcs.values()); }

  /** Build entity array compatible with RaycastSystem */
  buildEntityList(playerEntity) {
    const list = playerEntity ? [playerEntity] : [];
    for (const npc of this.npcs.values()) list.push(npc);
    return list;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _buildEntityList() {
    return Array.from(this.npcs.values());
  }

  _moveNPC(npc, dt) {
    switch (npc.heading) {
      case 'N': npc.y -= npc.speed * dt; break;
      case 'S': npc.y += npc.speed * dt; break;
      case 'E': npc.x += npc.speed * dt; break;
      case 'W': npc.x -= npc.speed * dt; break;
    }
  }

  _trySpawn(playerX, playerY) {
    // Pick a random nearby road segment
    const useNS = Math.random() < 0.5;

    if (useNS) {
      // Spawn on a N-S road
      const road  = this._pickNearbyNSRoad(playerX, playerY);
      if (!road) return;

      const dir   = Math.random() < 0.5 ? 'N' : 'S';
      const lane  = Math.floor(Math.random() * LANES_PER_DIR);
      const x     = nsLaneCentreX(road.g, dir, lane);
      const yOff  = MIN_SPAWN_DIST + Math.random() * (SPAWN_RADIUS - MIN_SPAWN_DIST);
      const y     = dir === 'N'
        ? playerY + yOff   // NPC behind player (south), heading north
        : playerY - yOff;  // NPC ahead of player (north), heading south

      if (y < 0 || y > WORLD_PX) return;

      this._spawnAt(x, y, dir);
    } else {
      // Spawn on an E-W road
      const road  = this._pickNearbyEWRoad(playerX, playerY);
      if (!road) return;

      const dir   = Math.random() < 0.5 ? 'E' : 'W';
      const lane  = Math.floor(Math.random() * LANES_PER_DIR);
      const y     = ewLaneCentreY(road.g, dir, lane);
      const xOff  = MIN_SPAWN_DIST + Math.random() * (SPAWN_RADIUS - MIN_SPAWN_DIST);
      const x     = dir === 'E'
        ? playerX - xOff
        : playerX + xOff;

      if (x < 0 || x > WORLD_PX) return;

      this._spawnAt(x, y, dir);
    }
  }

  _spawnAt(x, y, heading) {
    const id   = makeId();
    const base = BASE_SPEED + (Math.random() * 2 - 1) * SPEED_VARIANCE;
    this.npcs.set(id, {
      id,
      x, y,
      heading,
      speed:     base * 0.8,
      baseSpeed: base,
      color:     this._randomColor(),
    });
  }

  _pickNearbyNSRoad(playerX, playerY) {
    const nearby = this.nsRoads.filter(r => {
      const d = Math.abs(r.worldX - playerX);
      return d < SPAWN_RADIUS;
    });
    return nearby.length ? nearby[Math.floor(Math.random() * nearby.length)] : null;
  }

  _pickNearbyEWRoad(playerX, playerY) {
    const nearby = this.ewRoads.filter(r => {
      const d = Math.abs(r.worldY - playerY);
      return d < SPAWN_RADIUS;
    });
    return nearby.length ? nearby[Math.floor(Math.random() * nearby.length)] : null;
  }

  _randomColor() {
    const palette = [0x00ccff, 0xff8800, 0xff00ff, 0x44cc44, 0xffcc00, 0xcc0000];
    return palette[Math.floor(Math.random() * palette.length)];
  }
}
