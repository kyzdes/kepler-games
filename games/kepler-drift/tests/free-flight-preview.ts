import * as T from 'three';
import type { Game } from '../src/game';
import type { Rock } from '../src/asteroids';
import type { Salvage } from '../src/salvage';
import { collectOre, mulberry32 } from '../src/state';

/** DEV-only staging and integration checks; the production entry drops this import. */
export function previewFreeFlight(game:Game):void {
  const params=new URLSearchParams(location.search);
  const sim=game as unknown as {
    tickFlight(dt:number):void; frame():void; lastFrame:number; uiClock:number;
    nearestTarget():T.Vector3; updateTarget():void;
    placeRock(rock:Rock,initial?:boolean,index?:number):void;
    salvage:Salvage; rng:()=>number;
    hooks:{phase(game:Game):void;update(game:Game):void};
  };
  game.audio.toggle(); game.renderer.setAnimationLoop(null);
  const clear=()=>game.rocks.forEach(rock=>{rock.wait=999;rock.root.visible=false;});
  const fresh=()=>{game.start('freeflight');game.autoFire=false;clear();game.freeFlight.throttle=0;};
  const step=(count:number)=>{for(let i=0;i<count && game.run.phase==='flying';i++)sim.tickFlight(1/60);};
  const checks:{name:string;passed:boolean;detail?:unknown}[]=[];
  const check=(name:string,passed:boolean,detail?:unknown)=>checks.push({name,passed,detail});
  if(params.get('free-flight-preview')==='test') {
    game.start('freeflight');check('free-flight starts in cockpit with automatic fire',game.run.mode==='freeflight'&&game.flightView==='cockpit'&&game.autoFire);
    check('field surrounds the ship in all three dimensions',game.rocks.some(r=>r.root.position.z>20)&&game.rocks.some(r=>r.root.position.x>30)&&game.rocks.some(r=>r.root.position.y<-20));
    fresh();game.keys.add('KeyW');step(120);game.keys.clear();check('W increases thrust',game.freeFlight.throttle>.75);
    const cruise=game.forwardSpeed;game.boost();step(90);check('boost increases speed and lasts six seconds',game.forwardSpeed>cruise*2 && game.boostTime>4);
    fresh();game.keys.add('KeyW');step(150);game.keys.clear();game.keys.add('KeyS');step(180);game.keys.clear();step(120);check('S can stop the ship',game.freeFlight.throttle===0&&game.forwardSpeed<.05);
    fresh();game.freeFlight.throttle=.7;game.keys.add('ArrowRight');step(150);game.keys.clear();
    const forward=new T.Vector3(0,0,-1).applyQuaternion(game.freeFlight.heading);
    check('ship turns back and leaves the original corridor',forward.z>.8 && game.freeFlight.position.x>13.5,game.freeFlight.position.toArray());
    game.keys.add('ArrowUp');step(180);game.keys.clear();check('pitch loop is unrestricted and vertical position is not clamped',Math.abs(game.freeFlight.position.y)>7);
    fresh();game.barrelRoll(1);step(35);check('barrel roll affects ship but not cockpit camera',game.camera.quaternion.angleTo(game.freeFlight.heading)<1e-8 && game.ship.root.quaternion.angleTo(game.freeFlight.heading)>.2);
    game.toggleFlightView();step(1);check('C view switch shows the real external ship',game.flightView==='chase'&&game.ship.root.visible);
    fresh();game.keys.add('ArrowRight');step(30);game.keys.clear();
    check('arrow keys steer without also strafing at zero thrust',game.freeFlight.position.length()<1e-8 && game.freeFlight.heading.angleTo(new T.Quaternion())>.2);
    fresh();game.toggleFlightView();step(1);
    const rear=game.rocks[0];rear.wait=0;rear.radius=1;rear.root.visible=true;rear.root.position.set(0,4.2,10);
    const front=game.rocks[1];front.wait=0;front.radius=3;front.root.visible=true;front.root.position.set(0,4.2,-40);
    sim.updateTarget();
    check('chase camera ignores targets behind the forward cannons',game.target===front && sim.nearestTarget().z<-3.7);
    fresh();game.freeFlight.position.set(120,-20,200);game.freeFlight.heading.setFromAxisAngle(new T.Vector3(0,1,0),Math.PI);
    step(1);const r=game.rocks[0];r.wait=0;r.root.visible=true;r.radius=3;r.hp=r.maxHp=100;r.kind='normal';r.root.position.set(120,-19.1,240);r.previousPosition?.copy(r.root.position);
    game.autoFire=true;step(100);check('actual Game fires and damages rocks after turning back',r.hp<100);
    fresh();game.freeFlight.position.set(120,-20,200);step(1);
    sim.salvage.dropReward(game.freeFlight.position.clone().add(new T.Vector3(0,0,6)),9,2);step(150);check('ore collects at positive world coordinates',game.run.mined===9);
    fresh();const collision=game.rocks[0];collision.wait=0;collision.root.visible=true;collision.radius=3;collision.kind='normal';collision.root.position.set(0,0,-1);collision.previousPosition?.copy(collision.root.position);step(1);check('collision still damages the ship',game.run.shield<game.run.maxShield);
    fresh();game.run.sectorTime=1000;step(1);check('timer cannot complete a mining contract',game.run.phase==='flying'&&game.run.sector===1);
    collectOre(game.run,50);game.openArmory();game.run.ore=0;game.closeArmory();step(1);check('contract counts collected ore even after spending',game.run.phase==='upgrade'&&game.freeMiningProgress>=40);
    game.nextSector();check('contract advances to a new world and restores shields',game.run.sector===2&&game.run.phase==='flying'&&game.run.shield===game.run.maxShield&&game.freeMiningProgress===0);
    fresh();game.run.sector=6;collectOre(game.run,140);step(1);check('sixth contract ends without a boss',game.run.phase==='ended'&&game.run.won&&!game.boss.active);
    game.returnToMenu();game.start('expedition');clear();step(60);check('classic expedition remains available after free flight',game.run.mode==='expedition'&&game.ship.root.visible&&game.camera.position.z===20);
    const result=document.createElement('pre');result.id='free-probe-result';result.style.cssText='position:fixed;inset:20px;z-index:50;overflow:auto;background:#071620;color:#c9e5ec;padding:20px;font:12px monospace';
    const payload={passed:checks.every(c=>c.passed),total:checks.length,checks};result.textContent=JSON.stringify(payload,null,2);document.body.append(result);
    game.run.phase='paused';sim.hooks.phase(game);game.composer.render();return;
  }
  game.start('freeflight');sim.rng=mulberry32(31725);
  game.rocks.forEach((rock,i)=>sim.placeRock(rock,true,i));
  const sector=Math.max(1,Math.min(6,Number(params.get('sector'))||1));
  for(let i=1;i<sector;i++) {game.run.phase='upgrade';game.nextSector();}
  if(params.get('free-flight-preview')==='chase')game.toggleFlightView();
  game.freeFlight.update(1,{steerX:0,steerY:0,strafe:0,throttle:0,boost:false,speed:36});
  sim.lastFrame=performance.now();sim.uiClock=1;sim.frame();
  document.getElementById('toast')!.classList.remove('visible');
  const paint=()=>requestAnimationFrame(()=>{sim.lastFrame=performance.now();sim.uiClock=1;sim.frame();});
  window.addEventListener('keydown',paint);window.addEventListener('keyup',paint);document.addEventListener('click',paint);window.addEventListener('resize',paint);
}
