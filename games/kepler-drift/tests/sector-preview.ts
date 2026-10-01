import type { Game } from '../src/game';
import { SECTOR_SECONDS, TOTAL_SECTORS, collectOre } from '../src/state';
import { WEAPON_ORDER } from '../src/weapons';

/** Imported only by the DEV branch. Real game, camera and HUD; paused renderer
 * for repeatable sector screenshots, without a production runtime debug API. */
export function previewSector(game: Game): void {
  const params=new URLSearchParams(location.search);
  const sector=Math.max(1,Math.min(TOTAL_SECTORS,Number(params.get('sector-preview')) || 1));
  game.audio.toggle(); game.start();
  for(let i=1;i<sector;i++) {
    game.run.phase='upgrade'; game.run.elapsed=i*SECTOR_SECONDS; game.nextSector();
  }
  const sim=game as unknown as { tickFlight(dt:number):void; frame():void; lastFrame:number; uiClock:number;
    asteroidVisuals: {apply(rock: Game['rocks'][number]):void} };
  game.renderer.setAnimationLoop(null);
  const roll=Number(params.get('roll'));
  if(roll) {
    game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
    game.barrelRoll(roll<0 ? -1 : 1);
    for(let i=0;i<24;i++) sim.tickFlight(1/60);
  }
  if(params.has('boost')) {
    game.boost();
    for(let i=0;i<24;i++) sim.tickFlight(1/60);
  }
  if(params.has('armory')) {
    collectOre(game.run,Math.max(0,Math.min(500,Number(params.get('ore')) || 0)));
    game.openArmory();
  }
  const weapon=params.get('weapon');
  if(WEAPON_ORDER.some(id=>id===weapon)) game.selectWeapon(weapon as typeof WEAPON_ORDER[number]);
  if(params.has('encounter')) {
    for (const [i,x,y,z,radius,kind] of [[0,0,.43,-36,2.8,'normal'],[1,0,.43,-64,3.2,'armored'],
      [2,0,.43,-100,2.5,'normal'],[3,-9,2,-10,2.4,'volatile']] as const) {
      const rock=game.rocks[i]; rock.kind=kind; rock.wait=0; rock.radius=radius; rock.ore=true;
      rock.hp=rock.maxHp=100; rock.root.visible=true; rock.root.position.set(x,y,z); rock.root.scale.setScalar(radius);
      sim.asteroidVisuals.apply(rock);
    }
    const p=game.rocks[0].root.position.clone().project(game.camera); game.pointer.set(p.x,p.y);
  }
  if(params.has('beam')) {
    game.selectWeapon('cutter'); game.autoFire=false; game.fireInput.press(42);
    sim.tickFlight(1/60); game.fireInput.clear();
  }
  sim.uiClock=1; sim.lastFrame=performance.now(); sim.frame();
  if(params.has('beam')) {
    // Show the separated halves rather than the coincident first instant.
    for(let i=0;i<10;i++) sim.tickFlight(1/60);
    sim.uiClock=1; sim.lastFrame=performance.now(); sim.frame();
  }
  document.querySelector<HTMLElement>('.game-app')!.dataset.previewSector=String(sector);
  // A launch toast is transient gameplay feedback, not part of a static scene.
  document.getElementById('toast')!.classList.remove('visible');
}
