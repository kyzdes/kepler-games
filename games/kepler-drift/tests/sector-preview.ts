import type { Game } from '../src/game';
import { SECTOR_SECONDS, collectOre } from '../src/state';

/** Imported only by the DEV branch. Real game, camera and HUD; paused renderer
 * for repeatable sector screenshots, without a production runtime debug API. */
export function previewSector(game: Game): void {
  const params=new URLSearchParams(location.search);
  const sector=Math.max(1,Math.min(3,Number(params.get('sector-preview')) || 1));
  game.audio.toggle(); game.start();
  for(let i=1;i<sector;i++) {
    game.run.phase='upgrade'; game.run.elapsed=i*SECTOR_SECONDS; game.nextSector();
  }
  const sim=game as unknown as { tickFlight(dt:number):void; frame():void; lastFrame:number; uiClock:number };
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
  sim.uiClock=1; sim.lastFrame=performance.now(); sim.frame();
  document.querySelector<HTMLElement>('.game-app')!.dataset.previewSector=String(sector);
  // A launch toast is transient gameplay feedback, not part of a static scene.
  document.getElementById('toast')!.classList.remove('visible');
}
