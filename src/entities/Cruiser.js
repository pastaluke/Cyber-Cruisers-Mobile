/**
 * Cruiser — the player's vehicle.
 *
 * Driving model:
 *  - Always auto-accelerates toward cruiseSpeed.
 *  - RaycastSystem feeds in a brakeForce (0–1) that reduces target speed.
 *  - Brake button adds an additional manual brakeForce (for docking etc.).
 *  - Lane changes are initiated by holding left/right zones; the cruiser
 *    smoothly tweens to the target lane centre.
 *  - Heading changes (turns) are queued and executed at intersections.
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

    // Turn queue
    this._queuedHeading   = null;  // heading to adopt at next intersection

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

  /** Called by TouchControls when player wants to change lane */
  queueLaneLeft()  { this._laneQueueLeft  = true; }
  queueLaneRight() { this._laneQueueRight = true; }

  /** Called by TouchControls to hold/release manual brake */
  setManualBrake(active) { this._manualBrake = active; }

  /** Queue a heading change to be applied at the next intersection */
  queueHeading(h) { this._queuedHeading = h; }

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

    // Process a queued lane change
    if (this._laneQueueLeft || this._laneQueueRight) {
      const dir   = (this.heading === 'N' || this.heading === 'E') ? this.heading
                  : (this.heading === 'S' ? 'N' : 'E'); // effective northbound/eastbound side

      const goInner = (this.heading === 'N' || this.heading === 'E')
        ? this._laneQueueLeft : this._laneQueueRight;

      const newLane = goInner
        ? Math.max(0, this.laneIndex - 1)
        : Math.min(LANES_PER_DIR - 1, this.laneIndex + 1);

      if (newLane !== this.laneIndex) {
        this.laneIndex = newLane;
        let target;
        if (isVertical) {
          target = nsLaneCentreX(this.roadGroup, this.heading, newLane);
        } else {
          target = ewLaneCentreY(this.roadGroup, this.heading, newLane);
        }
        this._laneTweenTarget = target;
        this._laneTweenActive = true;
      }

      this._laneQueueLeft  = false;
      this._laneQueueRight = false;
    }
  }

  _checkIntersection(cityGen) {
    if (!this._queuedHeading) return;
    if (this._queuedHeading === this.heading) { this._queuedHeading = null; return; }

    const isVertical = this.heading === 'N' || this.heading === 'S';

    // At an intersection: road must exist in both axes
    const nsGroup = cityGen.nsRoadGroupAt(this.x);
    const ewGroup = cityGen.ewRoadGroupAt(this.y);
    if (nsGroup === -1 || ewGroup === -1) return;

    // Execute turn
    const newH = this._queuedHeading;
    this._queuedHeading = null;
    this.heading = newH;

    const newIsVertical = newH === 'N' || newH === 'S';

    // Snap to correct lane centre on new road
    if (newIsVertical) {
      this.x         = nsLaneCentreX(nsGroup, newH, 0);
      this.roadGroup = nsGroup;
      this.laneIndex = 0;
    } else {
      this.y         = ewLaneCentreY(ewGroup, newH, 0);
      this.roadGroup = ewGroup;
      this.laneIndex = 0;
    }

    this._laneTweenActive = false;
  }
}
