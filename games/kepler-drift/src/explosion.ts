export const LARGE_ASTEROID_RADIUS = 3;

/** Reused by every burst; never allocate PCM in the collision loop. */
export function createExplosionNoise(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 1.8), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A rock fracture: low impact, sharp crack, then a falling debris rumble. */
export function playAsteroidExplosion(
  context: BaseAudioContext, output: AudioNode, noise: AudioBuffer,
  radius: number, pan: number, distance: number, overlapGain: number,
  ended: () => void,
): AudioBufferSourceNode {
  const t = context.currentTime;
  const size = Math.max(0, Math.min(1, (radius - LARGE_ASTEROID_RADIUS) / 3));
  const duration = 1.15 + size * .5;
  const bus = context.createGain();
  bus.gain.value = (.95 + size * .3) * overlapGain / (1 + Math.max(0, distance) / 120);
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-.8, Math.min(.8, pan));
  bus.connect(panner); panner.connect(output);

  const body = context.createBufferSource(); body.buffer = noise;
  const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = .7;
  lowpass.frequency.setValueAtTime(1300, t);
  lowpass.frequency.exponentialRampToValueAtTime(85, t + duration);
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(0, t);
  bodyGain.gain.linearRampToValueAtTime(.9, t + .012);
  bodyGain.gain.exponentialRampToValueAtTime(.0001, t + duration);
  body.connect(lowpass); lowpass.connect(bodyGain); bodyGain.connect(bus);

  const crack = context.createBufferSource(); crack.buffer = noise; crack.playbackRate.value = 1.6;
  const bandpass = context.createBiquadFilter(); bandpass.type = 'bandpass'; bandpass.frequency.value = 1900; bandpass.Q.value = .6;
  const crackGain = context.createGain();
  crackGain.gain.setValueAtTime(0, t);
  crackGain.gain.linearRampToValueAtTime(.48, t + .003);
  crackGain.gain.exponentialRampToValueAtTime(.0001, t + .16);
  crack.connect(bandpass); bandpass.connect(crackGain); crackGain.connect(bus);

  const impact = context.createOscillator(); impact.type = 'sine';
  impact.frequency.setValueAtTime((110 - size * 20) * (.97 + Math.random() * .06), t);
  impact.frequency.exponentialRampToValueAtTime(29, t + .65);
  const impactGain = context.createGain();
  impactGain.gain.setValueAtTime(0, t);
  impactGain.gain.linearRampToValueAtTime(.85, t + .008);
  impactGain.gain.exponentialRampToValueAtTime(.0001, t + .85);
  impact.connect(impactGain); impactGain.connect(bus);

  body.start(t); body.stop(t + duration);
  crack.start(t, .2); crack.stop(t + .17);
  impact.start(t); impact.stop(t + .86);
  body.onended = () => {
    for (const node of [body, lowpass, bodyGain, crack, bandpass, crackGain, impact, impactGain, bus, panner]) node.disconnect();
    ended();
  };
  return body;
}
