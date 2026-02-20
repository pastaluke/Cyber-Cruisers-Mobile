/**
 * CityGen — seeded procedural city generator
 *
 * World is a WORLD_CHUNKS × WORLD_CHUNKS chunk grid.
 * Each chunk = ROAD_TILES (road) + BLOCK_TILES (buildings) in each axis.
 *
 * Road layout within a road strip (ROAD_TILES = 4):
 *   N-S road (vertical):  cols 0,1 = Southbound  |  cols 2,3 = Northbound
 *   E-W road (horizontal): rows 0,1 = Westbound   |  rows 2,3 = Eastbound
 */

// ─── Constants ────────────────────────────────────────────────────────────────
export const TILE_SIZE    = 16;
export const ROAD_TILES   = 4;   // 2 lanes × 2 directions
export const BLOCK_TILES  = 36;  // building block width in tiles
export const CHUNK_TILES  = ROAD_TILES + BLOCK_TILES; // 40
export const WORLD_CHUNKS = 16;
export const WORLD_TILES  = WORLD_CHUNKS * CHUNK_TILES; // 224
export const WORLD_PX     = WORLD_TILES * TILE_SIZE;    // 3584

export const LANES_PER_DIR = ROAD_TILES / 2; // 2

// Tile IDs (Phaser tilemap data: 0 = blank, 1-N = tileset frame N-1)
export const TILE_ROAD_NS   = 1;
export const TILE_ROAD_EW   = 2;
export const TILE_CROSS     = 3;
export const TILE_BLDG_NEON = 4;
export const TILE_BLDG_IND  = 5;
export const TILE_BLDG_RES  = 6;
export const TILE_BLDG_CORP = 7;
export const TILE_BLDG_OUT  = 8;

export const DISTRICT_TILE = [
  TILE_BLDG_NEON,
  TILE_BLDG_IND,
  TILE_BLDG_RES,
  TILE_BLDG_CORP,
  TILE_BLDG_OUT,
];

// ─── PRNG (mulberry32) ────────────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── District layout ──────────────────────────────────────────────────────────
// 0 Neon Commercial (centre) · 1 Industrial (NW) · 2 Residential (SW)
// 3 Corp Arcology (NE) · 4 Outer Ring (SE)
function assignDistrict(chunkX, chunkY) {
  const cx = chunkX / WORLD_CHUNKS - 0.5;
  const cy = chunkY / WORLD_CHUNKS - 0.5;
  if (Math.hypot(cx, cy) < 0.18) return 0;
  if (cx <  0 && cy <  0) return 1;
  if (cx >= 0 && cy <  0) return 3;
  if (cx <  0 && cy >= 0) return 2;
  return 4;
}

// ─── Lane geometry helpers ────────────────────────────────────────────────────

/** World-pixel left edge of N-S road at chunk column g */
export function nsRoadX(g) {
  return g * CHUNK_TILES * TILE_SIZE;
}

/** World-pixel top edge of E-W road at chunk row g */
export function ewRoadY(g) {
  return g * CHUNK_TILES * TILE_SIZE;
}

/**
 * Centre-X of a lane on the N-S road at chunk column g.
 * dir: 'N' (northbound) | 'S' (southbound)
 * lane: 0 = inner, 1 = outer
 */
export function nsLaneCentreX(g, dir, lane = 0) {
  const col = dir === 'N' ? LANES_PER_DIR + lane : lane;
  return nsRoadX(g) + col * TILE_SIZE + TILE_SIZE / 2;
}

/**
 * Centre-Y of a lane on the E-W road at chunk row g.
 * dir: 'E' (eastbound) | 'W' (westbound)
 * lane: 0 = inner, 1 = outer
 */
export function ewLaneCentreY(g, dir, lane = 0) {
  const row = dir === 'E' ? LANES_PER_DIR + lane : lane;
  return ewRoadY(g) + row * TILE_SIZE + TILE_SIZE / 2;
}

// ─── CityGen ──────────────────────────────────────────────────────────────────
export class CityGen {
  constructor(seed = 0x1337c0de) {
    this.seed = seed >>> 0;
  }

  generate() {
    const rng = makePRNG(this.seed);
    const size = WORLD_TILES;

    // District map [chunkRow][chunkCol]
    const districtMap = Array.from({ length: WORLD_CHUNKS }, (_, gy) =>
      Array.from({ length: WORLD_CHUNKS }, (_, gx) => assignDistrict(gx, gy))
    );

    // Tile grid [row][col]
    const tiles = Array.from({ length: size }, (_, ty) =>
      Array.from({ length: size }, (_, tx) => {
        const chunkX = tx % CHUNK_TILES;
        const chunkY = ty % CHUNK_TILES;
        const isRoadCol = chunkX < ROAD_TILES;
        const isRoadRow = chunkY < ROAD_TILES;

        if (isRoadCol && isRoadRow) return TILE_CROSS;
        if (isRoadCol) return TILE_ROAD_NS;
        if (isRoadRow) return TILE_ROAD_EW;

        // Building — assign district with minor variation
        const gx = Math.floor(tx / CHUNK_TILES);
        const gy = Math.floor(ty / CHUNK_TILES);
        const d  = districtMap[gy][gx];
        // Rare adjacent-district spill (adds visual texture)
        const hash = ((tx * 7 + ty * 13) ^ (this.seed >>> 5)) & 0x1f;
        if (hash === 0) return DISTRICT_TILE[(d + 1) % 5];
        return DISTRICT_TILE[d];
      })
    );

    // Road lists for traffic system
    const nsRoads = Array.from({ length: WORLD_CHUNKS }, (_, g) => ({
      type: 'NS', g, worldX: nsRoadX(g),
    }));
    const ewRoads = Array.from({ length: WORLD_CHUNKS }, (_, g) => ({
      type: 'EW', g, worldY: ewRoadY(g),
    }));

    return { tiles, districtMap, nsRoads, ewRoads };
  }

  /** Returns NS road chunk column at worldX, or -1 if not on a road. */
  nsRoadGroupAt(worldX) {
    const g     = Math.floor(worldX / (CHUNK_TILES * TILE_SIZE));
    if (g < 0 || g >= WORLD_CHUNKS) return -1;
    const local = worldX - g * CHUNK_TILES * TILE_SIZE;
    return local < ROAD_TILES * TILE_SIZE ? g : -1;
  }

  /** Returns EW road chunk row at worldY, or -1 if not on a road. */
  ewRoadGroupAt(worldY) {
    const g     = Math.floor(worldY / (CHUNK_TILES * TILE_SIZE));
    if (g < 0 || g >= WORLD_CHUNKS) return -1;
    const local = worldY - g * CHUNK_TILES * TILE_SIZE;
    return local < ROAD_TILES * TILE_SIZE ? g : -1;
  }

  /**
   * Snap a world coordinate to the nearest lane centre on the current road.
   * Returns { laneX or laneY, laneIndex, dir, roadGroup }.
   */
  snapToLane(worldX, worldY, heading) {
    if (heading === 'N' || heading === 'S') {
      const g = this.nsRoadGroupAt(worldX);
      if (g === -1) return null;
      const dir = heading === 'N' ? 'N' : 'S';
      // Find nearest lane
      let best = { dist: Infinity, lane: 0 };
      for (let l = 0; l < LANES_PER_DIR; l++) {
        const cx = nsLaneCentreX(g, dir, l);
        const d  = Math.abs(worldX - cx);
        if (d < best.dist) { best = { dist: d, lane: l, cx }; }
      }
      return { laneX: best.cx, laneIndex: best.lane, dir, roadGroup: g };
    } else {
      const g = this.ewRoadGroupAt(worldY);
      if (g === -1) return null;
      const dir = heading === 'E' ? 'E' : 'W';
      let best = { dist: Infinity, lane: 0 };
      for (let l = 0; l < LANES_PER_DIR; l++) {
        const cy = ewLaneCentreY(g, dir, l);
        const d  = Math.abs(worldY - cy);
        if (d < best.dist) { best = { dist: d, lane: l, cy }; }
      }
      return { laneY: best.cy, laneIndex: best.lane, dir, roadGroup: g };
    }
  }
}
