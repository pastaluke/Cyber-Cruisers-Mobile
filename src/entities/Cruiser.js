/**
 * Cruiser — the player's vehicle.
 *
 * Driving model:
 *  - Always auto-accelerates toward cruiseSpeed.
 *  - RaycastSystem feeds in a brakeForce (0–1) that reduces target speed.
 *  - Brake button adds an additional manual brakeForce (for docking etc.).
 *  - Lane changes are triggered by swipe or zone tap/hold.
 *    laneIndex always maps screen-space: lower = left/top of screen.
 *  - Turns are automatic at intersections based on lane:
 *      laneIndex 0              → LEFT TURN  (driver's leftmost)
 *      laneIndex 1 … N-2        → STRAIGHT
 *      laneIndex LANES_PER_DIR-1 → RIGHT TURN (driver's rightmost)
 *
 * The Cruiser does NOT use Phaser physics — position is managed manually
 * so we have full control over the smooth acceleration model.
 */

import {
  CHUNK_TILES, TILE_SIZE, ROAD_TILES, LANES_PER_DIR, WORLD_PX,
  nsLaneCentreX, ewLaneCentreY,
} from '../systems/CityGen.js';

const ACCEL          = 90;   // px/s² acceleration
const DECEL          = 160;  // px/s² deceleration (braking)
const LANE_TWEEN_SPD = 140;  // px/s lateral movement speed
const MANUAL_BRAKE   = 0.85; // fraction of cruise speed applied as brake target

const HEADING_KEYS = { N: 0, E: 1, S: 2, W: 3 };
const HEADINGS     = ['N', 'E', 'S', 'W'];

export class Cruiser {
  /**
   * @param {object} vehicleClass — entry from vehicles.json
   * @param {number} startX — world X
   * @param {number} startY — world Y
   * @param {string} startHeading — 'N' | 'S' | 'E' | 'W'
   * @param {number} startLane — 0 or 1
   * @param {number} startRoadGroup — chunk group index of starting road
   */
  constructor(vehicleClass, startX, startY, startHeading, startLane, startRoadGroup) {
    this.id           = 'player';
    this.vehicleClass = vehicleClass;
    this.cruiseSpeed  = vehicleClass.stats.speed;

    // World position
    this.x = startX;
    this.y = startY;

    // Movement state
    this.speed        = 0;
    this.heading      = startHeading;
    this.laneIndex    = startLane;
    this.roadGroup    = startRoadGroup;

    // Lane-change tween state
    this._laneTweenActive = false;
    this._laneTweenTarget = null;  // target pixel (x or y depending on heading axis)
    this._laneQueueLeft   = false;
    this._laneQueueRight  = false;

    // Intersection state (prevents re-triggering while inside one crossing)
    this._inIntersection  = false;

    // Braking
    this._manualBrake     = false;
    this._brakeForce      = 0;     // from RaycastSystem, set each frame
  }

  // ─── Called each frame by GameScene ────────────────────────────────────────

  update(delta, brakeForce, cityGen) {
    const dt = delta / 1000;
    this._brakeForce = brakeForce;

    // 1. Determine effective speed target
    const autoBrake    = brakeForce;                    // 0–1 from raycast
    const manualBrake  = this._manualBrake ? MANUAL_BRAKE : 0;
    const combinedBrake = Math.max(autoBrake, manualBrake);
    const targetSpeed   = this.cruiseSpeed * (1 - combinedBrake);

    // 2. Accelerate / decelerate toward target
    if (this.speed < targetSpeed) {
      this.speed = Math.min(targetSpeed, this.speed + ACCEL * dt);
    } else if (this.speed > targetSpeed) {
      this.speed = Math.max(targetSpeed, this.speed - DECEL * dt);
    }

    // 3. Advance world position in heading direction
    switch (this.heading) {
      case 'N': this.y -= this.speed * dt; break;
      case 'S': this.y += this.speed * dt; break;
      case 'E': this.x += this.speed * dt; break;
      case 'W': this.x -= this.speed * dt; break;
    }

    // Clamp to world bounds
    this.x = Math.max(0, Math.min(WORLD_PX, this.x));
    this.y = Math.max(0, Math.min(WORLD_PX, this.y));

    // 4. Lane tween (lateral movement)
    this._updateLaneTween(dt);

    // 5. Check for intersection — execute queued turn if present
    if (cityGen) this._checkIntersection(cityGen);
  }

  /** Called by TouchControls: swipe left/up = lower laneIndex, swipe right/down = higher */
  queueLaneLeft()  { this._laneQueueLeft  = true; }
  queueLaneRight() { this._laneQueueRight = true; }

  /** Called by TouchControls to hold/release manual brake */
  setManualBrake(active) { this._manualBrake = active; }

  /** Entity descriptor for RaycastSystem */
  toEntity() {
    return { id: this.id, x: this.x, y: this.y, heading: this.heading };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _updateLaneTween(dt) {
    const isVertical = this.heading === 'N' || this.heading === 'S';

    if (this._laneTweenActive) {
      const target = this._laneTweenTarget;
      const current = isVertical ? this.x : this.y;
      const diff    = target - current;
      const step    = Math.sign(diff) * Math.min(Math.abs(diff), LANE_TWEEN_SPD * dt);

      if (isVertical) this.x += step; else this.y += step;

      if (Math.abs(diff) < 0.5) {
        if (isVertical) this.x = target; else this.y = target;
        this._laneTweenActive = false;
      }
      return; // don't queue another change mid-tween
    }

    // Process a queued lane change.
    // laneIndex is screen-space: lower = left/top of screen, higher = right/bottom.
    if (this._laneQueueLeft || this._laneQueueRight) {
      const newLane = this._laneQueueLeft
        ? Math.max(0, this.laneIndex - 1)
        : Math.min(LANES_PER_DIR - 1, this.laneIndex + 1);

      if (newLane !== this.laneIndex) {
        this.laneIndex = newLane;
        const target = isVertical
          ? nsLaneCentreX(this.roadGroup, this.heading, newLane)
          : ewLaneCentreY(this.roadGroup, this.heading, newLane);
        this._laneTweenTarget = target;
        this._laneTweenActive = true;
      }

      this._laneQueueLeft  = false;
      this._laneQueueRight = false;
    }
  }

  _checkIntersection(cityGen) {
    const nsGroup = cityGen.nsRoadGroupAt(this.x);
    const ewGroup = cityGen.ewRoadGroupAt(this.y);
    const atIntersection = nsGroup !== -1 && ewGroup !== -1;

    if (!atIntersection) {
      this._inIntersection = false;
      return;
    }
    if (this._inIntersection) return; // already handled this crossing
    this._inIntersection = true;

    // Determine which lane type we're in.
    // "Forward" headings (N, E): laneIndex 0 = driver's left, LANES_PER_DIR-1 = driver's right.
    // "Backward" headings (S, W): laneIndex LANES_PER_DIR-1 = driver's left, 0 = driver's right.
    const isForward   = this.heading === 'N' || this.heading === 'E';
    const inLeftLane  = isForward
      ? this.laneIndex === 0
      : this.laneIndex === LANES_PER_DIR - 1;
    const inRightLane = isForward
      ? this.laneIndex === LANES_PER_DIR - 1
      : this.laneIndex === 0;

    if (!inLeftLane && !inRightLane) return; // straight lane — pass through

    // Compute new heading
    const LEFT_TURN  = { N: 'W', S: 'E', E: 'N', W: 'S' };
    const RIGHT_TURN = { N: 'E', S: 'W', E: 'S', W: 'N' };
    const newH = inLeftLane ? LEFT_TURN[this.heading] : RIGHT_TURN[this.heading];

    this.heading = newH;
    const newIsForward  = newH === 'N' || newH === 'E';
    const newIsVertical = newH === 'N' || newH === 'S';

    // After a left turn, land in the left-turn lane of the new road.
    // After a right turn, land in the right-turn lane of the new road.
    // For forward headings that lane is index 0 (left turn) or LANES_PER_DIR-1 (right turn);
    // for backward headings the positions are swapped.
    const newLane = inLeftLane
      ? (newIsForward ? 0 : LANES_PER_DIR - 1)
      : (newIsForward ? LANES_PER_DIR - 1 : 0);

    this.laneIndex = newLane;
    if (newIsVertical) {
      this.x         = nsLaneCentreX(nsGroup, newH, newLane);
      this.roadGroup = nsGroup;
    } else {
      this.y         = ewLaneCentreY(ewGroup, newH, newLane);
      this.roadGroup = ewGroup;
    }
    this._laneTweenActive = false;
  }
}
