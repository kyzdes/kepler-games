import * as T from 'three';

export type FlightView = 'cockpit' | 'chase';

export interface FreeFlightControls {
  /** Normalized mouse/arrow axes. Positive X turns right; positive Y looks up. */
  steerX: number;
  steerY: number;
  /** A/D translation along the ship's local right axis, independent of throttle. */
  strafe: number;
  /** Signed W/S adjustment rate, not the current throttle setting. */
  throttle: number;
  boost: boolean;
  /** Unboosted full-throttle cruise speed in world units per second. */
  speed: number;
}

export const FREE_FLIGHT_MAX_SPEED = 180;
export const FREE_FLIGHT_DEFAULT_THROTTLE = .65;

const DEAD_ZONE = .055;
const TURN_RATE = 1.4;
const STEER_RESPONSE = 9;
const VELOCITY_RESPONSE = 4;
const THROTTLE_RATE = .4;
const BOOST_MULTIPLIER = 2.6;
const MAX_DT = .1;
const MAX_STEP = 1 / 120;

const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const axis = (value: number): number => T.MathUtils.clamp(finite(value), -1, 1);

/** Unlimited world-space flight. Heading is navigation only: forward is local
 * -Z, and cosmetic model banking/barrel rolls must never be applied to it.
 * Local yaw/pitch remain continuous through vertical and inverted attitudes;
 * there is no horizon correction or commanded rotation about the forward axis. */
export class FreeFlight {
  readonly position = new T.Vector3();
  readonly heading = new T.Quaternion();
  readonly velocity = new T.Vector3();
  private throttleLevel = FREE_FLIGHT_DEFAULT_THROTTLE;
  private yawRate = 0;
  private pitchRate = 0;
  private bankAngle = 0;
  private readonly rotation = new T.Quaternion();
  private readonly turnAxis = new T.Vector3();
  private readonly desiredVelocity = new T.Vector3();
  private readonly cameraPosition = new T.Vector3();
  private camera: T.PerspectiveCamera | null = null;
  private cameraView: FlightView | null = null;

  get throttle(): number { return this.throttleLevel; }
  set throttle(value: number) { this.throttleLevel = T.MathUtils.clamp(finite(value), 0, 1); }
  get speed(): number { return this.velocity.length(); }
  /** Optional visual ship bank in radians. It never enters navigation/camera. */
  get bank(): number { return this.bankAngle; }

  reset(): void {
    this.position.set(0, 0, 0);
    this.heading.identity();
    this.velocity.set(0, 0, 0);
    this.throttleLevel = FREE_FLIGHT_DEFAULT_THROTTLE;
    this.yawRate = 0; this.pitchRate = 0; this.bankAngle = 0;
    this.camera = null; this.cameraView = null;
  }

  update(dt: number, controls: FreeFlightControls): void {
    dt = T.MathUtils.clamp(finite(dt), 0, MAX_DT);
    if (dt === 0) return;

    let steerX = axis(controls.steerX), steerY = axis(controls.steerY);
    const radius = Math.hypot(steerX, steerY);
    const steer = radius > DEAD_ZONE ? (Math.min(1, radius) - DEAD_ZONE) / ((1 - DEAD_ZONE) * radius) : 0;
    steerX *= steer; steerY *= steer;
    const targetYaw = steerX * TURN_RATE, targetPitch = steerY * TURN_RATE;
    const strafe = axis(controls.strafe), throttle = axis(controls.throttle);
    const cruise = T.MathUtils.clamp(finite(controls.speed), 0, FREE_FLIGHT_MAX_SPEED);
    const boost = controls.boost ? BOOST_MULTIPLIER : 1;
    const steps = Math.ceil(dt / MAX_STEP), step = dt / steps;
    const steeringDecay = Math.exp(-STEER_RESPONSE * step);
    const steeringTravel = (1 - steeringDecay) / STEER_RESPONSE;
    const velocityDecay = Math.exp(-VELOCITY_RESPONSE * step);
    const velocityTravel = (1 - velocityDecay) / VELOCITY_RESPONSE;
    const bankFollow = 1 - Math.exp(-8 * step);

    for (let i = 0; i < steps; i++) {
      // Integrate the smoothed angular rate, rather than sampling it at the
      // frame's end; repeated 30/60/144 Hz input follows nearly the same path.
      const yawAngle = targetYaw * step + (this.yawRate - targetYaw) * steeringTravel;
      const pitchAngle = targetPitch * step + (this.pitchRate - targetPitch) * steeringTravel;
      this.yawRate = targetYaw + (this.yawRate - targetYaw) * steeringDecay;
      this.pitchRate = targetPitch + (this.pitchRate - targetPitch) * steeringDecay;
      const turn = Math.hypot(pitchAngle, yawAngle);
      if (turn > 0) {
        this.turnAxis.set(pitchAngle / turn, -yawAngle / turn, 0);
        this.rotation.setFromAxisAngle(this.turnAxis, turn / 2);
        this.heading.multiply(this.rotation).normalize();
      }

      this.throttleLevel = T.MathUtils.clamp(this.throttleLevel + throttle * THROTTLE_RATE * step, 0, 1);
      this.desiredVelocity.set(strafe * cruise * boost * .55, 0, -cruise * this.throttleLevel * boost);
      this.desiredVelocity.clampLength(0, FREE_FLIGHT_MAX_SPEED).applyQuaternion(this.heading);
      // Exact translation for this substep's constant desired velocity. This
      // preserves gentle drift after steering without frame-dependent travel.
      this.position.addScaledVector(this.velocity, velocityTravel)
        .addScaledVector(this.desiredVelocity, step - velocityTravel);
      this.velocity.multiplyScalar(velocityDecay)
        .addScaledVector(this.desiredVelocity, 1 - velocityDecay);

      if (turn > 0) this.heading.multiply(this.rotation).normalize();
      const targetBank = T.MathUtils.clamp(-this.yawRate * .24 - strafe * .18, -.42, .42);
      this.bankAngle += (targetBank - this.bankAngle) * bankFollow;
    }
  }

  resetCamera(camera: T.PerspectiveCamera, view: FlightView = 'chase'): void {
    this.cameraTarget(view);
    camera.position.copy(this.cameraPosition);
    camera.quaternion.copy(this.heading);
    camera.updateMatrixWorld();
    this.camera = camera; this.cameraView = view;
  }

  updateCamera(camera: T.PerspectiveCamera, dt: number, view: FlightView = 'chase'): void {
    if (this.camera !== camera || this.cameraView !== view) {
      this.resetCamera(camera, view);
      return;
    }
    this.cameraTarget(view);
    if (view === 'cockpit') camera.position.copy(this.cameraPosition);
    else camera.position.lerp(this.cameraPosition, 1 - Math.exp(-14 * T.MathUtils.clamp(finite(dt), 0, MAX_DT)));
    camera.quaternion.copy(this.heading);
    camera.updateMatrixWorld();
  }

  private cameraTarget(view: FlightView): void {
    this.cameraPosition.set(0, view === 'cockpit' ? .9 : 4.2, view === 'cockpit' ? -.85 : 19)
      .applyQuaternion(this.heading).add(this.position);
  }
}
