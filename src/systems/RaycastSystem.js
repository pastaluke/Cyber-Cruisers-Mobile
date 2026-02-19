/**
 * RaycastSystem — ADAS-style forward collision awareness.
 *
 * No actual collision occurs. Instead, each vehicle casts a ray in its
 * heading direction and detects other vehicles within its look-ahead
 * distance. The resulting brakeForce (0–1) is fed back to the vehicle's
 * speed controller, which smoothly decelerates before reaching the target.
 *
 * This mimics Automatic Emergency Braking (AEB) and Adaptive Cruise
 * Control (ACC) found in modern vehicles.
 */

const RAY_LENGTH       = 120; // px — full detection range
const STOP_DISTANCE    = 28;  // px — come to a full stop inside this gap
const LANE_TOLERANCE   = 10;  // px — lateral tolerance for same-lane check

/**
 * Heading vectors. Positive Y is down (Phaser's default screen space).
 * Note: 'N' (north) = moving up the screen = negative Y velocity.
 */
const HEADING_VEC = {
  N: { dx:  0, dy: -1 },
  S: { dx:  0, dy:  1 },
  E: { dx:  1, dy:  0 },
  W: { dx: -1, dy:  0 },
};

/**
 * Given a list of entity descriptors, computes the brakeForce for each one.
 *
 * @param {Array<{ id, x, y, heading }>} entities
 * @returns {Map<id, number>} brakeForce per entity (0 = free, 1 = stop)
 */
export function castAllRays(entities) {
  const result = new Map();

  for (const ego of entities) {
    result.set(ego.id, castRay(ego, entities));
  }

  return result;
}

/**
 * Cast a ray for a single entity and return its brakeForce.
 *
 * @param {{ id, x, y, heading }} ego
 * @param {Array<{ id, x, y, heading }>} entities
 * @returns {number} brakeForce 0–1
 */
export function castRay(ego, entities) {
  const vec = HEADING_VEC[ego.heading];
  if (!vec) return 0;

  // The "forward axis" and "lateral axis" depend on heading
  const isVertical = ego.heading === 'N' || ego.heading === 'S';

  let minDist    = RAY_LENGTH;
  let foundAhead = false;

  for (const other of entities) {
    if (other.id === ego.id) continue;
    if (other.heading !== ego.heading) continue; // only same-direction traffic

    // Lateral alignment check (same lane?)
    const lateralDist = isVertical
      ? Math.abs(other.x - ego.x)
      : Math.abs(other.y - ego.y);

    if (lateralDist > LANE_TOLERANCE) continue;

    // Forward distance — signed along the heading direction
    const forwardDist = isVertical
      ? (other.y - ego.y) * vec.dy   // vec.dy = ±1
      : (other.x - ego.x) * vec.dx;

    if (forwardDist <= 0) continue;            // behind us
    if (forwardDist > RAY_LENGTH) continue;    // too far

    if (forwardDist < minDist) {
      minDist    = forwardDist;
      foundAhead = true;
    }
  }

  if (!foundAhead) return 0;

  if (minDist <= STOP_DISTANCE) return 1;

  // Smooth deceleration curve: 0 at RAY_LENGTH, 1 at STOP_DISTANCE
  const t = 1 - (minDist - STOP_DISTANCE) / (RAY_LENGTH - STOP_DISTANCE);
  return Math.max(0, Math.min(1, t * t)); // quadratic — gentler at distance
}
