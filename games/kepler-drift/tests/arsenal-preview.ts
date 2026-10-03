import type { Game } from '../src/game';
import { collectOre } from '../src/state';

/** Development-only UI staging. The production bundle drops this import.
 * Starts with the real locked inventory and uses the actual purchase handlers. */
export function previewArsenal(game: Game): void {
  const params = new URLSearchParams(location.search);
  game.audio.toggle(); game.start(); game.renderer.setAnimationLoop(null);
  collectOre(game.run, Math.max(0,Math.min(3000,Number(params.get('ore')) || 0)));
  const sim = game as unknown as { hooks:{phase(game:Game):void};frame():void;uiClock:number;lastFrame:number };
  if(params.get('arsenal-preview') === 'workshop') {
    game.run.phase='upgrade';game.run.sectorTime=75;sim.hooks.phase(game);
  } else game.openArmory();
  sim.uiClock=1;sim.lastFrame=performance.now();sim.frame();
  document.getElementById('toast')!.classList.remove('visible');
}
