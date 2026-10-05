import { Game } from '../src/game';
import { SECTOR_VISUALS } from '../src/sectors';
import { WEAPON_ORDER, WEAPONS } from '../src/weapons';
import type { WeaponId } from '../src/weapons';
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
const atmosphere = game as unknown as { cosmos: { root:T.Group; update(dt: number): void; setSector(sector:number): void } };
const blur=game as unknown as { boostBlurPass: {enabled:boolean; uniforms:{strength:{value:number}}} };
const simulation=game as unknown as {tickFlight(dt:number):void; asteroidVisuals:{apply(rock:Game['rocks'][number]):void};
  invulnerable:number;projectiles:{count:number}};
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
  const weaponMeans:number[]=[], weaponErrors:number[]=[];
  const weaponScenes:{id:WeaponId;name:string;frames:number;minMean:number;activeFrames:number;kills:number;selected:boolean}[]=[];
  let weaponKills=0;
  for(const id of ['cutter','plasma','scatter','seeker','pulse'] as const) {
    game.start();game.autoFire=false;game.run.sector=3;atmosphere.cosmos.setSector(3);simulation.invulnerable=999;
    // Explicit graphical staging, not a purchase test or a production unlock.
    for(const weapon of WEAPON_ORDER) game.run.unlockedWeapons[weapon]=true;
    game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
    let aimPosition=new T.Vector3(0,.43,-35);
    if(id==='seeker') {
      const enemy=game.pirates.enemies[0];enemy.active=true;enemy.root.visible=true;
      enemy.hp=enemy.maxHp=999;enemy.position.set(12,1.5,-70);enemy.previousPosition.copy(enemy.position);
      enemy.age=3;enemy.side=1;enemy.startY=1.5;enemy.attack.phase='cooldown';enemy.attack.remaining=99;
      aimPosition=enemy.position.clone();
    } else {
      for(const [i,z,kind] of [[0,-35,'normal'],[1,-65,'armored'],[2,-100,'volatile']] as const) {
        const rock=game.rocks[i];rock.wait=0;rock.kind=kind;rock.radius=3;rock.hp=rock.maxHp=300;
        rock.root.position.set(0,.43,z);rock.previousPosition?.copy(rock.root.position);
        rock.root.scale.setScalar(3);rock.root.visible=true;simulation.asteroidVisuals.apply(rock);
      }
    }
    const aim=aimPosition.project(game.camera);game.pointer.set(aim.x,aim.y);
    game.selectWeapon(id);game.fireInput.press(7);
    const localMeans:number[]=[],frames=id==='cutter'?120:60;
    let activeFrames=0;
    for(let frame=0;frame<frames;frame++) {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      simulation.tickFlight(1/60);game.composer.render();
      if(id==='cutter'?game.weapons.cutting:simulation.projectiles.count>0) activeFrames++;
      const pixels=new Uint8Array(gl.drawingBufferWidth*4);
      gl.readPixels(0,Math.floor(gl.drawingBufferHeight*.5),gl.drawingBufferWidth,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let total=0;for(let i=0;i<pixels.length;i+=4) total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
      const mean=total/gl.drawingBufferWidth;weaponMeans.push(mean);localMeans.push(mean);
      const error=gl.getError();if(error) weaponErrors.push(error);
    }
    weaponKills+=game.run.kills;
    weaponScenes.push({id,name:WEAPONS[id].name,frames,minMean:Number(Math.min(...localMeans).toFixed(2)),
      activeFrames,kills:game.run.kills,selected:game.weapons.selected===id});
    game.fireInput.clear();game.pause();
  }
  const encounterMeans:number[]=[],encounterErrors:number[]=[];
  game.start();game.autoFire=false;
  game.run.unlockedWeapons.cutter=true;simulation.invulnerable=999;
  game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
  for(const [i,index] of [0,3].entries()) {
    const enemy=game.pirates.enemies[index];enemy.active=true;enemy.root.visible=true;
    enemy.hp=enemy.maxHp=200;enemy.position.set(i?12:-11,2,i?-57:-37);enemy.previousPosition.copy(enemy.position);enemy.age=4;
    enemy.attack.phase='charging';enemy.attack.remaining=.8;enemy.lockedAim.copy(game.ship.root.position);
  }
  let bossStartHP=0,bossBeamFrames=0;
  for(let frame=0;frame<120;frame++) {
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    if(frame===60) {
      game.run.sector=3;atmosphere.cosmos.setSector(3);game.boss.spawn(3);
      game.boss.update(7.7,{player:game.ship.root.position,rocks:game.rocks,worldSpeed:game.forwardSpeed});
      bossStartHP=game.boss.battery.hp;
      const target=game.boss.bodyTarget!.position.clone().project(game.camera);game.pointer.set(target.x,target.y);
      game.selectWeapon('cutter');game.fireInput.press(7);
    }
    simulation.tickFlight(1/60);game.composer.render();
    if(frame>=60 && game.weapons.cutting && game.boss.reactorOpen) bossBeamFrames++;
    const pixels=new Uint8Array(gl.drawingBufferWidth*4);
    gl.readPixels(0,Math.floor(gl.drawingBufferHeight*.5),gl.drawingBufferWidth,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let total=0;for(let i=0;i<pixels.length;i+=4) total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
    encounterMeans.push(total/gl.drawingBufferWidth);
    const error=gl.getError();if(error)encounterErrors.push(error);
  }
  game.fireInput.clear();game.pause();
  const bossEvidence={startHP:bossStartHP,hp:game.boss.battery.hp,beamFrames:bossBeamFrames,label:game.boss.bodyTarget?.label};
  const freeMeans:number[]=[],freeErrors:number[]=[];
  const freeScenes:{sector:number;view:string;frames:number;minMean:number}[]=[];
  for(let sector=1;sector<=6;sector++) for(const view of ['cockpit','chase'] as const) {
    game.start('freeflight');game.autoFire=false;game.run.sector=sector;simulation.invulnerable=999;
    atmosphere.cosmos.setSector(sector);game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
    if(view==='chase')game.toggleFlightView();
    const localMeans:number[]=[];
    for(let frame=0;frame<30;frame++) {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      game.pointer.set(Math.sin(frame*.08)*.4,Math.sin(frame*.04)*.16);
      if(frame===5)game.boost();
      simulation.tickFlight(1/60);atmosphere.cosmos.root.position.copy(game.freeFlight.position);
      atmosphere.cosmos.update(1/60);blur.boostBlurPass.enabled=game.boostTime>0;blur.boostBlurPass.uniforms.strength.value=1;
      game.composer.render();
      const width=gl.drawingBufferWidth,pixels=new Uint8Array(width*4);let total=0;
      for(const y of [.35,.55,.75]) {
        gl.readPixels(0,Math.floor(gl.drawingBufferHeight*y),width,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        for(let i=0;i<pixels.length;i+=4)total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
      }
      const mean=total/(width*3);freeMeans.push(mean);localMeans.push(mean);
      const error=gl.getError();if(error)freeErrors.push(error);
    }
    freeScenes.push({sector,view,frames:localMeans.length,minMean:Number(Math.min(...localMeans).toFixed(2))});
  }
  game.pause();blur.boostBlurPass.enabled=false;
  // A stable black image must fail too: bloom alone can survive while the
  // sky, planet and ship are discarded. Three scanlines cover that distinction.
  const passed = drops === 0 && Math.min(...means) >= 15 && errors.length === 0 && centerDelta<.1 && edgeDelta>.1
    && Math.min(...weaponMeans)>=15 && weaponErrors.length===0 && weaponKills>=3
    && weaponScenes.length===WEAPON_ORDER.length && weaponScenes.every(scene=>scene.selected && scene.activeFrames>0)
    && Math.min(...encounterMeans)>=15 && encounterErrors.length===0
    && bossEvidence.beamFrames>0 && bossEvidence.hp>0 && bossEvidence.startHP-bossEvidence.hp>100
    && Math.min(...freeMeans)>=15 && freeErrors.length===0;
  result.textContent = JSON.stringify({
    passed, mode, frames: means.length, totalFrames:means.length+weaponMeans.length+encounterMeans.length+freeMeans.length,
    msaaSamples: game.composer.renderTarget1.samples,
    brightnessDrops: drops, minMean: Math.min(...means), maxMean: peak,
    sectors: Array.from({length:SECTOR_VISUALS.length},(_,i)=>({sector:i+1,minMean:Math.min(...means.slice(i*60,i*60+60)),maxMean:Math.max(...means.slice(i*60,i*60+60))})),
    minPeak: Math.min(...maxima), glErrors: errors, firstFrames: means.slice(0, 12),
    blurPixels:{centerDelta,edgeDelta},
    weapons:{frames:weaponMeans.length,minMean:Number(Math.min(...weaponMeans).toFixed(2)),glErrors:weaponErrors,
      kills:weaponKills,beamRemaining:game.weapons.remaining,scenes:weaponScenes},
    encounters:{frames:encounterMeans.length,minMean:Number(Math.min(...encounterMeans).toFixed(2)),glErrors:encounterErrors,
      boss:bossEvidence},
    freeFlight:{frames:freeMeans.length,minMean:Number(Math.min(...freeMeans).toFixed(2)),glErrors:freeErrors,scenes:freeScenes},
    assumptions:{arsenal:'all weapons explicitly unlocked for staged graphics only',boss:'real exposure after 7.7 seconds; no forced phase',balanceClaim:false},
  }, null, 2);
  result.dataset.complete='true';
  buttons.forEach(button => button.disabled = false);
}

for (const button of buttons) button.onclick = () => void measure(button.id as ProbeMode);
await measure('current');
