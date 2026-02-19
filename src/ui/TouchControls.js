/**
 * TouchControls — mobile touch input handler.
 *
 * Screen zones (360 × 780 logical canvas):
 *
 *   ┌────────────────────────────────────┐
 *   │        GAME WORLD (full screen)    │
 *   │                                   │
 *   │  LEFT ZONE  │         │ RIGHT ZONE │
 *   │  (hold →    │  CENTRE │ (hold →    │
 *   │   lane left)│         │  lane right)│
 *   │             │         │            │
 *   │        ┌──────────────┐            │
 *   │        │  BRAKE ZONE  │            │
 *   │        │  (hold down) │            │
 *   └────────┴──────────────┴────────────┘
 *
 * A "turn" is triggered by a quick swipe (< 250 ms, > 30 px) in a
 * non-lane-change direction (forward/back). This queues a heading change.
 *
 * Lane changes: holding left/right zone for > HOLD_THRESHOLD ms starts
 * sending repeated lane-change signals at LANE_REPEAT_INTERVAL intervals.
 */

const CANVAS_W = 360;
const CANVAS_H = 780;

const LEFT_ZONE_MAX  = CANVAS_W * 0.33;  // 0..119
const RIGHT_ZONE_MIN = CANVAS_W * 0.67;  // 241..360
const BRAKE_ZONE_Y   = CANVAS_H * 0.80;  // 624..780
const BRAKE_ZONE_X1  = CANVAS_W * 0.28;
const BRAKE_ZONE_X2  = CANVAS_W * 0.72;

const HOLD_THRESHOLD      = 100;  // ms before lane repeat starts
const LANE_REPEAT_INTERVAL = 250; // ms between lane changes while held
const SWIPE_TIME_MAX      = 300;  // ms — swipe gesture window
const SWIPE_MIN_DIST      = 40;   // px — minimum swipe distance

export class TouchControls {
  /**
   * @param {Phaser.Scene} scene
   * @param {Cruiser} cruiser
   */
  constructor(scene, cruiser) {
    this.scene   = scene;
    this.cruiser = cruiser;

    // Per-pointer tracking (multi-touch)
    this._pointers = new Map(); // pointerId → pointerState

    scene.input.on('pointerdown',  (p) => this._onDown(p));
    scene.input.on('pointermove',  (p) => this._onMove(p));
    scene.input.on('pointerup',    (p) => this._onUp(p));
    scene.input.on('pointerout',   (p) => this._onUp(p));
  }

  update(delta) {
    const now = Date.now();

    for (const [id, ps] of this._pointers) {
      if (!ps.active) continue;

      const held = now - ps.downTime;

      // Brake zone
      if (ps.zone === 'brake') {
        this.cruiser.setManualBrake(true);
        continue;
      }

      // Lane-change zones with hold + repeat
      if (ps.zone === 'left' || ps.zone === 'right') {
        if (held >= HOLD_THRESHOLD) {
          const elapsed = now - (ps.lastLaneChange || ps.downTime + HOLD_THRESHOLD);
          if (elapsed >= LANE_REPEAT_INTERVAL) {
            if (ps.zone === 'left')  this.cruiser.queueLaneLeft();
            else                     this.cruiser.queueLaneRight();
            ps.lastLaneChange = now;
          }
        }
      }
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _onDown(p) {
    const zone = this._zoneAt(p.x, p.y);
    this._pointers.set(p.id, {
      active:         true,
      zone,
      downX:          p.x,
      downY:          p.y,
      downTime:       Date.now(),
      lastLaneChange: null,
    });
  }

  _onMove(p) {
    const ps = this._pointers.get(p.id);
    if (!ps || !ps.active) return;
    ps.curX = p.x;
    ps.curY = p.y;
  }

  _onUp(p) {
    const ps = this._pointers.get(p.id);
    if (!ps) return;

    const now   = Date.now();
    const held  = now - ps.downTime;
    const dx    = (ps.curX ?? p.x) - ps.downX;
    const dy    = (ps.curY ?? p.y) - ps.downY;
    const dist  = Math.hypot(dx, dy);

    // Release brake
    if (ps.zone === 'brake') {
      this.cruiser.setManualBrake(false);
    }

    // Quick tap on left/right without hold → single lane change
    if (held < HOLD_THRESHOLD && dist < SWIPE_MIN_DIST && ps.zone !== 'brake') {
      if (ps.zone === 'left')  this.cruiser.queueLaneLeft();
      if (ps.zone === 'right') this.cruiser.queueLaneRight();
    }

    // Swipe gesture → queue turn
    if (held < SWIPE_TIME_MAX && dist >= SWIPE_MIN_DIST) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      // Map angle to cardinal swipe direction
      const swipeDir = this._angleToDir(angle);
      if (swipeDir) this._handleSwipeTurn(swipeDir);
    }

    ps.active = false;
    this._pointers.delete(p.id);

    // Ensure brake is released if no brake pointers remain
    const anyBrake = [...this._pointers.values()].some(s => s.active && s.zone === 'brake');
    if (!anyBrake) this.cruiser.setManualBrake(false);
  }

  _zoneAt(x, y) {
    if (y >= BRAKE_ZONE_Y && x >= BRAKE_ZONE_X1 && x <= BRAKE_ZONE_X2) return 'brake';
    if (x < LEFT_ZONE_MAX)  return 'left';
    if (x > RIGHT_ZONE_MIN) return 'right';
    return 'centre';
  }

  _angleToDir(deg) {
    // Normalise to 0-360
    const a = ((deg % 360) + 360) % 360;
    if (a >= 315 || a < 45)  return 'E';
    if (a >= 45  && a < 135) return 'S';
    if (a >= 135 && a < 225) return 'W';
    if (a >= 225 && a < 315) return 'N';
    return null;
  }

  _handleSwipeTurn(swipeDir) {
    // Convert swipe direction to heading and queue on cruiser
    // The swipe direction IS the intended new heading
    this.cruiser.queueHeading(swipeDir);
  }
}
