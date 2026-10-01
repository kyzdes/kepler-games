import * as T from 'three';
import { Game } from '../src/game';
import type { Projectiles } from '../src/projectiles';
import type { Salvage } from '../src/salvage';
import { asteroidOre, buyUpgrade, flightSpeed, mulberry32, SECTOR_SECONDS, TOTAL_SECTORS } from '../src/state';
import type { WeaponId } from '../src/weapons';
import { PlanetStorm } from '../src/storm';
import { StableFlightCamera } from '../src/camera';
import { sectorVisual } from '../src/sectors';

// Development-only fixture: exercise the real Game via its controls and publish
// assertions in the DOM. No debug API is exposed by the production entry point.
const result = document.querySelector<HTMLPreElement>('#result')!;
const game = new Game(document.querySelector<HTMLElement>('#scene')!, {
  update() {}, phase() {}, toast() {}, help() {}, sound() {},
});
game.audio.toggle();
await game.init(({percent, label}) => result.textContent = `${Math.round(percent)}% · ${label}`);
game.renderer.setAnimationLoop(null);
type Rock = Game['rocks'][number];
const sim = game as unknown as {
  tickFlight(dt: number): void; breakRock(rock: Rock): void;
  projectiles: Projectiles; salvage: Salvage;
  invulnerable: number; rng: () => number;
  frame(): void; lastFrame: number; fire(weapon:WeaponId):void;
};
const step = (frames = 1) => {
  for (let i = 0; i < frames && game.run.phase === 'flying'; i++) sim.tickFlight(1 / 60);
};
const clearRocks = () => game.rocks.forEach(r => { r.wait = 999; r.root.visible = false; });
const fresh = () => { game.start(); game.autoFire = false; clearRocks(); };
const key = (code: string, type = 'keydown', repeat = false) => game.renderer.domElement.dispatchEvent(new KeyboardEvent(type, {code, repeat, bubbles:true}));
const placeHit = () => {
  const rock = game.rocks[0]; rock.radius = .5; rock.wait = 0; rock.root.visible = true;
  rock.root.position.copy(game.ship.root.position); step(); clearRocks();
};
function render(): void {
  const c=game.ship.root.position;
  new StableFlightCamera().reset(game.camera,c.x,c.y-game.roll.height);
  game.composer.render();
}
document.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false);
result.textContent = 'Готово';
document.querySelector<HTMLButtonElement>('#run')!.onclick = () => {
  document.body.classList.remove('preview');
  const checks: {name:string; passed:boolean; details?:unknown}[] = [];
  const record = (name:string, passed:boolean, details?:unknown) => checks.push({name, passed, details});
  game.start(); clearRocks(); step();
  record('Старт включает автоогонь и выпускает снаряды', game.autoFire && sim.projectiles.count > 0);
  key('KeyQ'); key('KeyQ','keyup');
  record('Q отключает автоогонь', !game.autoFire);
  game.start(); clearRocks();
  record('Повторный старт возвращает автоогонь', game.autoFire);
  fresh(); key('Space'); step();
  record('Один пробел не запускает бочку и не стреляет', !game.roll.active && sim.projectiles.count === 0);
  key('Space','keyup'); key('KeyA'); key('Space'); step(24);
  record('A + пробел запускает вращение и уклонение влево', game.roll.active && game.ship.root.rotation.z > .5 && game.ship.root.position.x < -1);
  key('KeyA','keyup'); key('Space','keyup');
  const rollTime = () => (game.roll as unknown as {elapsed:number}).elapsed;
  const elapsed = rollTime(); game.pause(); step(20);
  record('Пауза останавливает бочку', rollTime() === elapsed);
  game.resume(); step(62);
  record('Бочка завершается без обратного вращения', !game.roll.active && game.roll.cooldown > 0);
  record('Повторная бочка заблокирована перезарядкой', !game.barrelRoll(1));
  step(105); record('После перезарядки можно уклониться снова', game.barrelRoll(1));
  fresh(); key('Space'); key('KeyD'); step(24);
  record('Пробел + D работает в обратном порядке', game.roll.active && game.ship.root.rotation.z < -.5 && game.ship.root.position.x > 1);
  const beforeRepeat = rollTime(); key('Space','keydown',true);
  record('Повтор клавиши не перезапускает вращение', rollTime() === beforeRepeat);
  fresh(); game.touchMove.x = -1;
  record('Сенсорная бочка использует направление джойстика', game.barrelRoll() && game.roll.direction === -1);
  fresh(); game.barrelRoll(1); placeHit();
  record('В начале бочки столкновение защищено', game.run.shield === 75);
  step(32); placeHit();
  record('После окна защиты урон снова проходит', game.run.shield < 75);
  game.start(); record('Новый забег сбрасывает бочку и перезарядку', !game.roll.active && game.roll.cooldown === 0);
  const speeds:number[]=[];
  for(let sector=1;sector<=TOTAL_SECTORS;sector++) { game.run.sector=sector; game.run.sectorTime=0; speeds.push(game.forwardSpeed); game.run.sectorTime=SECTOR_SECONDS; speeds.push(game.forwardSpeed); }
  record('Настоящая игра ускоряется во всех шести секторах', speeds.join(',') === '18,22,24,28,30,34,36,40,42,46,48,52', speeds);
  const travel=(boosting:boolean) => {
    fresh(); const rock=game.rocks[0]; rock.wait=0; rock.root.visible=true; rock.root.position.set(60,0,-150);
    if(boosting) game.boost(); step(60);
    return rock.root.position.z+150;
  };
  const normalTravel=travel(false), boostedTravel=travel(true);
  record('Форсаж реально перемещает астероиды в 2,6 раза быстрее', Math.abs(boostedTravel/normalTravel-2.6)<1e-7, {normalTravel,boostedTravel});
  const soundCalls:{radius:number;pan:number;distance:number}[]=[];
  const originalRockSound=game.audio.rock;
  game.audio.rock=(radius=1,pan=0,distance=0)=>soundCalls.push({radius,pan,distance});
  fresh();
  for(const [radius,x] of [[1.5,-8],[4.5,8]]) {
    const rock=game.rocks[0]; rock.radius=radius; rock.wait=0; rock.root.position.set(x,0,-40); sim.breakRock(rock);
  }
  game.audio.rock=originalRockSound;
  record('Разрушение передаёт размер, сторону и дистанцию в звук взрыва', soundCalls.length===2 && soundCalls[0].radius===1.5 && soundCalls[1].radius===4.5 && soundCalls[0].pan<0 && soundCalls[1].pan>0 && soundCalls.every(s=>s.distance>40),soundCalls);
  fresh(); let expected = 0;
  for(let i=0;i<100;i++) {
    const rock=game.rocks[i % game.rocks.length]; rock.radius=1+(i%6); rock.ore=i%4!==3; rock.wait=0;
    rock.root.position.set(0,0,-30); expected+=asteroidOre(rock.radius,rock.ore); sim.breakRock(rock);
  }
  record('Общая награда сохраняется при заполнении пула кристаллов', sim.salvage.drops.length===150 && sim.salvage.drops.reduce((sum,ore)=>sum+ore.value,0)===expected, {crystals:sim.salvage.drops.length, ore:expected});
  clearRocks(); game.run.sectorTime=SECTOR_SECONDS-1/120; step();
  record('На переходе в мастерскую руда собрана ровно один раз', game.run.phase==='upgrade' && game.run.ore===expected && sim.salvage.drops.length===0);
  const maps = () => ['Планета сектора','Панорама сектора'].map(name => {
    const mesh=game.scene.getObjectByName(name) as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;
    return mesh.material.map?.name;
  });
  fresh();
  const journey=[];
  for(let sector=1;sector<=TOTAL_SECTORS;sector++) {
    clearRocks(); const visual=sectorVisual(sector);
    const correctMaps=maps().join(',')===[visual.planet,visual.sky].join(',');
    step(SECTOR_SECONDS*60+1);
    journey.push({sector,seconds:game.run.sectorTime,phase:game.run.phase,correctMaps});
    if(sector<TOTAL_SECTORS) game.nextSector();
  }
  record('Шесть секторов длятся по 75 секунд и заканчиваются победой', journey.every((j,i)=>Math.abs(j.seconds-75)<.02 && j.phase===(i<TOTAL_SECTORS-1?'upgrade':'ended')) && Math.abs(game.run.elapsed-SECTOR_SECONDS*TOTAL_SECTORS)<.12 && game.run.won, journey);
  record('Переходы реально меняют текстуры планеты и галактики', journey.every(j=>j.correctMaps));
  game.start();
  record('Новый забег возвращает текстуры первого сектора', maps().join(',')===[sectorVisual(1).planet,sectorVisual(1).sky].join(','));
  for(const side of [-1,1]) {
    fresh(); game.barrelRoll(side); game.touchMove.x=side;
    const orientation=game.camera.quaternion.clone(), y=game.camera.position.y, fov=game.camera.fov;
    let stable=true, highest=0;
    for(let frame=0;frame<75;frame++) {
      sim.lastFrame=performance.now()-1000/60; sim.frame();
      highest=Math.max(highest,game.ship.root.position.y);
      stable &&= game.camera.quaternion.angleTo(orientation)<1e-7 && game.camera.position.y===y && game.camera.fov===fov;
    }
    record(`Камера ровная в полном сальто ${side<0?'влево':'вправо'}`, stable && highest>2 && !game.roll.active, {highest,cameraHeight:game.camera.position.y,fov});
  }
  fresh();
  const cameraPosition=game.camera.position.clone(), cameraRotation=game.camera.quaternion.clone(), cameraFov=game.camera.fov;
  placeHit(); sim.lastFrame=performance.now()-1000/60; sim.frame();
  game.boost(); sim.lastFrame=performance.now()-1000/60; sim.frame();
  record('Столкновение и рывок не трясут и не приближают камеру', game.run.shield<75 && game.boostTime>0 && game.camera.position.equals(cameraPosition) && game.camera.quaternion.angleTo(cameraRotation)<1e-7 && game.camera.fov===cameraFov);
  fresh(); key('ShiftLeft'); key('ShiftLeft','keyup'); step(300);
  record('Shift поддерживает форсаж больше пяти секунд', game.boostTime>.99 && game.boostTime<1.01 && game.boostCooldown===0);
  record('Сильное ускорение сохраняется к концу форсажа', Math.abs(game.forwardSpeed/flightSpeed(game.run.sector,game.run.sectorTime)-2.6)<1e-8);
  const remaining=game.boostTime; game.boost();
  record('Повторный Shift не продлевает действующий форсаж', game.boostTime===remaining);
  step(61);
  record('Перезарядка начинается после шести секунд форсажа', game.boostTime===0 && game.boostCooldown>4.4 && game.boostCooldown<=4.5);
  record('После форсажа возвращается обычная скорость сектора', game.forwardSpeed===flightSpeed(game.run.sector,game.run.sectorTime));
  game.boost(); record('Во время перезарядки нельзя запустить форсаж', game.boostTime===0);
  step(270); game.boost(); record('После перезарядки форсаж снова доступен', game.boostTime===6);
  fresh(); let salvage=0;
  for(let i=0;i<30;i++) {
    const rock=game.rocks[i]; rock.radius=3; rock.ore=true; rock.wait=0; rock.root.position.set(0,0,-25);
    salvage+=asteroidOre(rock.radius,true); sim.breakRock(rock);
  }
  clearRocks(); sim.salvage.drops.forEach(ore=>ore.mesh.position.copy(game.ship.root.position)); step();
  record('Руда из разрушенных астероидов попадает на баланс оружейной', game.run.ore===salvage && game.run.mined===salvage && sim.salvage.drops.length===0, {salvage,balance:game.run.ore});
  game.boost(); step(30); key('KeyU'); key('KeyU','keyup');
  const armoryElapsed=game.run.elapsed, armoryBoost=game.boostTime;
  for(let i=0;i<20;i++) { sim.lastFrame=performance.now()-1000/30; sim.frame(); }
  record('U открывает оружейную и останавливает время полёта и форсажа', game.run.phase==='armory' && game.run.elapsed===armoryElapsed && game.boostTime===armoryBoost);
  const baseDamage=game.run.damage;
  const laserBought=buyUpgrade(game.run,'laser'), tripleBought=buyUpgrade(game.run,'multishot');
  record('Собранная руда оплачивает энергоконтур и тройной залп', laserBought && tripleBought && game.run.ore===salvage-155 && game.run.mined===salvage && game.run.damage===baseDamage*1.35 && game.run.levels.laser===2);
  key('KeyU'); key('KeyU','keyup'); sim.fire('pulse');
  record('Улучшенное оружие выпускает по три луча из каждого ствола', game.run.phase==='flying' && game.run.multishot && sim.projectiles.count===game.ship.muzzles.length*3);
  game.pause(); game.openArmory(); game.closeArmory();
  record('Оружейная, открытая из паузы, возвращает на паузу', game.run.phase==='paused');
  game.start(); record('Новая экспедиция сбрасывает форсаж и купленное оружие', game.boostTime===0 && game.boostCooldown===0 && game.run.levels.laser===1 && !game.run.multishot);
  fresh(); key('Digit2'); key('Digit2','keyup'); game.autoFire=true; step();
  record('Клавиша 2 меняет оружие в полёте и автоогонь выпускает плазму', game.run.phase==='flying' && game.weapons.selected==='plasma' && sim.projectiles.count===1);
  fresh(); key('Digit3'); key('Digit3','keyup'); game.autoFire=true; step(20);
  record('Автоогонь не тратит заряд резака на пустой прицел', game.weapons.selected==='cutter' && !game.weapons.cutting && game.weapons.cooldown===0);
  for(const [i,z,kind] of [[0,-30,'normal'],[1,-60,'armored'],[2,-100,'volatile']] as const) {
    const rock=game.rocks[i]; rock.wait=0; rock.radius=3; rock.kind=kind; rock.hp=999; rock.maxHp=999;
    rock.root.visible=true; rock.root.position.set(0,.43,z); rock.root.scale.setScalar(3);
  }
  const beamTarget=game.rocks[0].root.position.clone().project(game.camera); game.pointer.set(beamTarget.x,beamTarget.y);
  step();
  record('Резак прорезает обычный, бронированный и взрывной камни за один проход', game.weapons.cutting && game.run.kills===3 && game.rocks.slice(0,3).every(r=>r.wait>0) && game.run.shield===75);
  const beamTime=game.weapons.remaining; game.pause(); step(20);
  record('Пауза сохраняет оставшееся время луча', game.weapons.remaining===beamTime);
  game.resume(); game.openArmory(); step(20);
  record('Оружейная тоже останавливает луч', game.weapons.remaining===beamTime);
  game.closeArmory(); clearRocks(); step(108);
  record('Луч выключается через 1,8 секунды и начинает заряд', !game.weapons.cutting && game.weapons.cooldown>11.9 && game.weapons.cooldown<=12);
  step(720); game.fireInput.press(1); step(); game.fireInput.clear();
  record('Через 12 секунд можно снова включить резак вручную', game.weapons.cutting);
  key('Digit1'); key('Digit1','keyup');
  record('Переключение во время луча прекращает его и сохраняет зарядку', game.weapons.selected==='pulse' && !game.weapons.cutting && game.weapons.cooldown===12);
  const shootVolatile=(z:number) => {
    fresh(); const rock=game.rocks[0]; rock.wait=0; rock.radius=1; rock.kind='volatile'; rock.hp=999; rock.maxHp=999;
    rock.root.visible=true; rock.root.position.set(0,.43,z); rock.root.scale.setScalar(1);
    const p=rock.root.position.clone().project(game.camera); game.pointer.set(p.x,p.y); game.autoFire=true;
    step(25);
    return {shield:game.run.shield,kills:game.run.kills,hidden:rock.wait>0};
  };
  const closeBlast=shootVolatile(-11), farBlast=shootVolatile(-45);
  record('Любое попадание взрывает красный камень, близкий взрыв наносит урон', closeBlast.kills===1 && closeBlast.hidden && closeBlast.shield<75, closeBlast);
  record('Взрыв на безопасной дистанции не повреждает корабль', farBlast.kills===1 && farBlast.hidden && farBlast.shield===75, farBlast);
  fresh(); game.rocks[0].kind='volatile'; placeHit();
  record('Столкновение со взрывным астероидом наносит повышенный урон', game.run.shield<40);
  fresh(); const fatal=game.rocks[0]; fatal.wait=0; fatal.radius=1; fatal.kind='volatile'; fatal.root.position.set(0,0,-8);
  game.run.shield=0; game.run.hull=1; sim.breakRock(fatal); step();
  record('Смертельный близкий взрыв завершает забег', game.run.phase==='ended' && game.run.hull===0 && !game.run.won);
  game.start(); record('Рестарт возвращает импульсы и полный заряд луча', game.weapons.selected==='pulse' && game.weapons.cooldown===0 && !game.weapons.cutting);
  // Seeded pilot aims at the nearest rock ahead, purchases no upgrades, remains
  // in the center. These are reproducible samples, not human play telemetry.
  const samples=[];
  for(const seed of [11,37,83]) {
    const shapeRng=mulberry32(seed+1000);
    game.rocks.forEach((rock,i)=>{ rock.radius=i===0 ? 3.1 : 1+shapeRng()**1.4*4.8; rock.ore=i%4!==3; rock.root.scale.setScalar(rock.radius); });
    game.start(); sim.rng=mulberry32(seed);
    // Replace spawn randomness (start intentionally uses a fresh live seed).
    const rng=mulberry32(seed);
    for(const rock of game.rocks) { rock.root.position.set((rng()-.5)*43,(rng()-.5)*24,-25-rng()*260); }
    new StableFlightCamera().reset(game.camera);
    for(let frame=0;frame<SECTOR_SECONDS*60+1 && game.run.phase==='flying';frame++) {
      const target=game.rocks.filter(r=>r.wait<=0 && r.root.position.z<-9).sort((a,b)=>b.root.position.z-a.root.position.z)[0];
      if(target) { const p=target.root.position.clone().project(game.camera); game.pointer.set(p.x,p.y); }
      step();
    }
    samples.push({seed, phase:game.run.phase, kills:game.run.kills, ore:game.run.mined, hull:game.run.hull});
  }
  game.pause(); render();
  result.textContent = JSON.stringify({passed:checks.every(c=>c.passed), checks, stationaryAimSamples:samples},null,2);
};
function preview(direction:number):void {
  fresh();
  if(direction) { game.barrelRoll(direction); step(24); }
  const old=game.scene.getObjectByName('Грозы в атмосфере Кеплера');
  if(old?.parent) { const parent=old.parent; parent.remove(old); const storm=new PlanetStorm(); parent.add(storm.root); for(let i=0;i<50;i++) storm.update(1/60); }
  game.pause(); render(); document.body.classList.add('preview');
}
document.querySelector<HTMLButtonElement>('#storm')!.onclick=()=>preview(0);
document.querySelector<HTMLButtonElement>('#roll-left')!.onclick=()=>preview(-1);
document.querySelector<HTMLButtonElement>('#roll-right')!.onclick=()=>preview(1);
