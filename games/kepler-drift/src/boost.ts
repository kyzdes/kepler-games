export const BOOST_DURATION = 6;
export const BOOST_PROTECTION = .75;
export const BOOST_FORWARD_MULTIPLIER = 2.6;

const smooth = (x: number) => { const p=Math.max(0,Math.min(1,x)); return p*p*(3-2*p); };
/** Fade at both ends of the burn; the middle of the screen stays unblurred. */
export function boostEnvelope(remaining: number): number {
  if (remaining <= 0 || remaining > BOOST_DURATION) return 0;
  return smooth((BOOST_DURATION-remaining)/.35)*smooth(remaining/.5);
}

export class BoostDrive {
  remaining = 0;
  cooldown = 0;
  start(): boolean {
    if (this.remaining > 0 || this.cooldown > 0) return false;
    this.remaining=BOOST_DURATION;
    return true;
  }
  update(dt: number, rechargeSeconds: number): void {
    const elapsed=Math.max(0,dt), burning=Math.min(elapsed,this.remaining);
    const wasBurning=this.remaining>0;
    this.remaining=Math.max(0,this.remaining-burning);
    if (wasBurning && this.remaining===0) this.cooldown=rechargeSeconds;
    this.cooldown=Math.max(0,this.cooldown-(elapsed-burning));
  }
  reset(): void { this.remaining=0; this.cooldown=0; }
}
