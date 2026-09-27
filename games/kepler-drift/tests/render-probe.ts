import { Game } from '../src/game';

// Development-only regression fixture: sample the actual final framebuffer,
// with the same scene, camera, materials and composer as the game.
const result = document.querySelector<HTMLPreElement>('#result')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
const game = new Game(document.querySelector<HTMLElement>('#scene')!, {
  update() {}, phase() {}, toast() {}, help() {}, sound() {},
});
await game.init();
game.renderer.setAnimationLoop(null);
const initialSamples = game.composer.renderTarget1.samples;
const gl = game.renderer.getContext();
const atmosphere = game as unknown as { cosmos: { update(dt: number): void; setSector(sector:number): void } };
const blur=game as unknown as { boostBlurPass: {enabled:boolean; uniforms:{strength:{value:number}}} };

type ProbeMode = 'current' | 'legacy-msaa' | 'no-bloom';
async function measure(mode: ProbeMode): Promise<void> {
  buttons.forEach(button => button.disabled = true);
  result.textContent = `Измерение: ${mode}…`;
  for (const target of [game.composer.renderTarget1, game.composer.renderTarget2]) {
    target.samples = mode === 'current' ? initialSamples : 2;
    target.dispose();
  }
  game.composer.passes[1].enabled = mode !== 'no-bloom';
  const means: number[] = [];
  const maxima: number[] = [];
  const errors: number[] = [];
  for (let frame = 0; frame < 180; frame++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (frame % 60 === 0) atmosphere.cosmos.setSector(frame / 60 + 1);
    blur.boostBlurPass.enabled=frame%60>=20 && frame%60<40;
    blur.boostBlurPass.uniforms.strength.value=1;
    atmosphere.cosmos.update(1 / 60);
    game.composer.render(1 / 60);
    const width = gl.drawingBufferWidth;
    const pixels = new Uint8Array(width * 4);
    let total = 0, maximum = 0;
    for (const y of [.35, .55, .75]) {
      gl.readPixels(0, Math.floor(gl.drawingBufferHeight * y), width, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let i = 0; i < pixels.length; i += 4) {
        const level = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        total += level; maximum = Math.max(maximum, level);
      }
    }
    means.push(Number((total / (width * 3)).toFixed(2)));
    maxima.push(Number(maximum.toFixed(2)));
    const error = gl.getError(); if (error) errors.push(error);
  }
  const peak = Math.max(...means);
  const drops = means.filter(mean => mean < peak * .2).length;
  const readSquare=(x:number,y:number)=>{
    const pixels=new Uint8Array(64*64*4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth*x)-32,Math.floor(gl.drawingBufferHeight*y)-32,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return pixels;
  };
  const averageDelta=(a:Uint8Array,b:Uint8Array)=>a.reduce((sum,v,i)=>sum+(i%4===3?0:Math.abs(v-b[i])),0)/(a.length*.75);
  blur.boostBlurPass.enabled=false; game.composer.render();
  const centerBefore=readSquare(.5,.5), edgeBefore=readSquare(.05,.5);
  blur.boostBlurPass.enabled=true; game.composer.render();
  const centerDelta=averageDelta(centerBefore,readSquare(.5,.5)), edgeDelta=averageDelta(edgeBefore,readSquare(.05,.5));
  blur.boostBlurPass.enabled=false;
  // A stable black image must fail too: bloom alone can survive while the
  // sky, planet and ship are discarded. Three scanlines cover that distinction.
  const passed = drops === 0 && Math.min(...means) >= 15 && errors.length === 0 && centerDelta<.1 && edgeDelta>.1;
  result.textContent = JSON.stringify({
    passed, mode, frames: means.length, msaaSamples: game.composer.renderTarget1.samples,
    brightnessDrops: drops, minMean: Math.min(...means), maxMean: peak,
    sectors: [0,1,2].map(i=>({sector:i+1,minMean:Math.min(...means.slice(i*60,i*60+60)),maxMean:Math.max(...means.slice(i*60,i*60+60))})),
    minPeak: Math.min(...maxima), glErrors: errors, firstFrames: means.slice(0, 12),
    blurPixels:{centerDelta,edgeDelta},
  }, null, 2);
  buttons.forEach(button => button.disabled = false);
}

for (const button of buttons) button.onclick = () => void measure(button.id as ProbeMode);
await measure('current');
