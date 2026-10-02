import { Game } from '../src/game';
import { SECTOR_VISUALS } from '../src/sectors';
import * as T from 'three';

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
const simulation=game as unknown as {tickFlight(dt:number):void; asteroidVisuals:{apply(rock:Game['rocks'][number]):void}};
// This fixture checks graphics; audio has its own user-initiated fixture.
game.audio.start=()=>{};

type ProbeMode = 'current' | 'legacy-msaa' | 'no-bloom';
async function measure(mode: ProbeMode): Promise<void> {
  buttons.forEach(button => button.disabled = true);
  delete result.dataset.complete;
  result.textContent = `Измерение: ${mode}…`;
  for (const target of [game.composer.renderTarget1, game.composer.renderTarget2]) {
    target.samples = mode === 'current' ? initialSamples : 2;
    target.dispose();
  }
  game.composer.passes[1].enabled = mode !== 'no-bloom';
  const means: number[] = [];
  const maxima: number[] = [];
  const errors: number[] = [];
  for (let frame = 0; frame < SECTOR_VISUALS.length * 60; frame++) {
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
  game.start(); game.autoFire=false; game.run.sector=3; atmosphere.cosmos.setSector(3);
  for(const rock of game.rocks) { rock.wait=999; rock.root.visible=false; }
  for(const [i,z,kind] of [[0,-35,'normal'],[1,-65,'armored'],[2,-100,'volatile']] as const) {
    const rock=game.rocks[i]; rock.wait=0; rock.kind=kind; rock.radius=3; rock.hp=rock.maxHp=300;
    rock.root.position.set(0,.43,z); rock.root.scale.setScalar(3); rock.root.visible=true;
    simulation.asteroidVisuals.apply(rock);
  }
  const aim=game.rocks[0].root.position.clone().project(game.camera); game.pointer.set(aim.x,aim.y);
  game.selectWeapon('cutter'); game.fireInput.press(7);
  const weaponMeans:number[]=[], weaponErrors:number[]=[];
  for(let frame=0;frame<180;frame++) {
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    if(frame===110) {
      game.selectWeapon('plasma');
      const target=game.rocks[0]; target.wait=0; target.kind='normal'; target.hp=300; target.root.visible=true;
      target.root.position.set(0,.43,-35); simulation.asteroidVisuals.apply(target);
    }
    if(frame===150) game.selectWeapon('pulse');
    simulation.tickFlight(1/60); game.composer.render();
    const pixels=new Uint8Array(gl.drawingBufferWidth*4);
    gl.readPixels(0,Math.floor(gl.drawingBufferHeight*.5),gl.drawingBufferWidth,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let total=0; for(let i=0;i<pixels.length;i+=4) total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
    weaponMeans.push(total/gl.drawingBufferWidth);
    const error=gl.getError(); if(error) weaponErrors.push(error);
  }
  game.fireInput.clear(); game.pause();
  const weaponKills=game.run.kills;
  const encounterMeans:number[]=[],encounterErrors:number[]=[];
  game.start();game.autoFire=false;
  game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
  for(const [i,index] of [0,3].entries()) {
    const enemy=game.pirates.enemies[index];enemy.active=true;enemy.root.visible=true;
    enemy.hp=enemy.maxHp=200;enemy.position.set(i?12:-11,2,i?-57:-37);enemy.previousPosition.copy(enemy.position);enemy.age=4;
    enemy.attack.phase='charging';enemy.attack.remaining=.8;enemy.lockedAim.copy(game.ship.root.position);
  }
  for(let frame=0;frame<120;frame++) {
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    if(frame===60) {
      game.run.sector=3;atmosphere.cosmos.setSector(3);game.boss.spawn(3);
      game.boss.update(7.3,{player:game.ship.root.position,rocks:game.rocks,worldSpeed:game.forwardSpeed});
      const target=game.boss.bodyTarget!.position.clone().project(game.camera);game.pointer.set(target.x,target.y);
      game.selectWeapon('cutter');game.fireInput.press(7);
    }
    simulation.tickFlight(1/60);game.composer.render();
    const pixels=new Uint8Array(gl.drawingBufferWidth*4);
    gl.readPixels(0,Math.floor(gl.drawingBufferHeight*.5),gl.drawingBufferWidth,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let total=0;for(let i=0;i<pixels.length;i+=4) total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
    encounterMeans.push(total/gl.drawingBufferWidth);
    const error=gl.getError();if(error)encounterErrors.push(error);
  }
  game.fireInput.clear();game.pause();
  // A stable black image must fail too: bloom alone can survive while the
  // sky, planet and ship are discarded. Three scanlines cover that distinction.
  const passed = drops === 0 && Math.min(...means) >= 15 && errors.length === 0 && centerDelta<.1 && edgeDelta>.1
    && Math.min(...weaponMeans)>=15 && weaponErrors.length===0 && weaponKills>=3
    && Math.min(...encounterMeans)>=15 && encounterErrors.length===0;
  result.textContent = JSON.stringify({
    passed, mode, frames: means.length, msaaSamples: game.composer.renderTarget1.samples,
    brightnessDrops: drops, minMean: Math.min(...means), maxMean: peak,
    sectors: Array.from({length:SECTOR_VISUALS.length},(_,i)=>({sector:i+1,minMean:Math.min(...means.slice(i*60,i*60+60)),maxMean:Math.max(...means.slice(i*60,i*60+60))})),
    minPeak: Math.min(...maxima), glErrors: errors, firstFrames: means.slice(0, 12),
    blurPixels:{centerDelta,edgeDelta},
    weapons:{frames:weaponMeans.length,minMean:Number(Math.min(...weaponMeans).toFixed(2)),glErrors:weaponErrors,
      kills:weaponKills,beamRemaining:game.weapons.remaining},
    encounters:{frames:encounterMeans.length,minMean:Number(Math.min(...encounterMeans).toFixed(2)),glErrors:encounterErrors},
  }, null, 2);
  result.dataset.complete='true';
  buttons.forEach(button => button.disabled = false);
}

for (const button of buttons) button.onclick = () => void measure(button.id as ProbeMode);
await measure('current');
