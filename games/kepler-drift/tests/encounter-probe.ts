import * as T from 'three';
import { Game } from '../src/game';
import type { Rock } from '../src/asteroids';
import type { CombatTarget } from '../src/combat';
import type { EnemyProjectiles } from '../src/enemy-projectiles';
import type { Projectiles } from '../src/projectiles';
import type { Salvage } from '../src/salvage';
import { WEAPON_ORDER, WEAPONS } from '../src/weapons';
import type { WeaponId } from '../src/weapons';
import { visualSector } from '../src/expedition';
import type { RunMode } from '../src/expedition';
import { mulberry32, SECTOR_SECONDS } from '../src/state';
import { PIRATE_GRACE_SECONDS } from '../src/pirate-rules';
import { BOSS_CUTTER_DPS, BOSS_OPENING_DAMAGE_FRACTION, BOSS_TIMINGS, bossMaxHealth } from '../src/mining-boss';
import { sectorVisual } from '../src/sectors';

// Development-only integration fixture. All access below stays inside this
// entry point; the production game exposes no global debug API. Isolated
// collision cases use staged actors and step the real projectile systems.
const result = document.querySelector<HTMLPreElement>('#result')!;
const runButton = document.querySelector<HTMLButtonElement>('#run')!;
const previewButton = document.querySelector<HTMLButtonElement>('#preview')!;
const game = new Game(document.querySelector<HTMLElement>('#scene')!, {
  update() {}, phase() {}, toast() {}, help() {}, sound() {},
});
game.audio.toggle();

const sim = game as unknown as {
  tickFlight(dt: number): void;
  breakRock(rock: Rock): void;
  fire(weapon: WeaponId): void;
  hitHostile(target: CombatTarget, damage: number, position: T.Vector3): void;
  combatTargets(): CombatTarget[];
  projectiles: Projectiles;
  salvage: Salvage;
  rng: () => number;
  frame(): void;
  lastFrame: number;
  cosmos: { setSector(sector: number): void } | null;
};
const fleetSim = game.pirates as unknown as { projectiles: EnemyProjectiles };
const DT = 1 / 60;
const clearRocks = () => game.rocks.forEach(rock => { rock.wait = 999; rock.root.visible = false; });
const step = (frames = 1) => {
  for (let i = 0; i < frames && game.run.phase === 'flying'; i++) sim.tickFlight(DT);
};
const fresh = (mode: RunMode = 'expedition', sector = 1) => {
  game.renderer.setAnimationLoop(null);
  game.start(mode); game.autoFire = false; clearRocks();
  // Combat is isolated from the shop here: this fixture explicitly unlocks
  // every gun. The actual paid shop and the pulse-only start have other probes.
  for (const weapon of WEAPON_ORDER) game.run.unlockedWeapons[weapon] = true;
  sim.rng = mulberry32(61723); game.run.sector = sector;
  game.ship.root.updateMatrixWorld(true); game.camera.updateMatrixWorld(true);
};
const aimAt = (position: T.Vector3) => {
  game.camera.updateMatrixWorld(true);
  const point = position.clone().project(game.camera); game.pointer.set(point.x, point.y);
};
const syntheticEnemy = (x: number, y: number, z: number, hp = 100, kind: 'fighter' | 'sniper' = 'fighter') => {
  const enemy = game.pirates.enemies.find(candidate => !candidate.active && candidate.kind === kind);
  if (!enemy) throw new Error(`Нет свободного ${kind} в настоящем пуле`);
  enemy.active = true; enemy.root.visible = true; enemy.hp = enemy.maxHp = hp;
  enemy.position.set(x, y, z); enemy.root.rotation.set(0, 0, 0); enemy.age = 0;
  enemy.previousPosition?.copy(enemy.position);
  enemy.attack.phase = 'cooldown'; enemy.attack.remaining = .9; enemy.attack.shotsLeft = 0;
  enemy.root.updateMatrixWorld(true);
  return enemy;
};
const syntheticRock = (index: number, x: number, y: number, z: number, radius: number, kind: Rock['kind'] = 'normal', hp = 500) => {
  const rock = game.rocks[index];
  rock.radius = radius; rock.kind = kind; rock.hp = rock.maxHp = hp;
  rock.wait = 0; rock.root.visible = true; rock.root.position.set(x, y, z); rock.root.scale.setScalar(radius);
  rock.previousPosition?.copy(rock.root.position);
  rock.root.updateMatrixWorld(true); return rock;
};
const updateShots = (frames = 30) => {
  for (let i = 0; i < frames; i++) {
    sim.projectiles.update(DT, game.rocks, game.run.damage,
      rock => { if (rock.kind === 'volatile' || rock.hp <= 0) sim.breakRock(rock); },
      () => {}, () => game.run.hull > 0,
      { targets: sim.combatTargets(), hit: (target, damage, position) => sim.hitHostile(target, damage, position) });
  }
};
const rewardTotal = () => sim.salvage.drops.reduce((sum, drop) => sum + drop.value, 0);
const bossContext = () => ({ player: game.ship.root.position, rocks: game.rocks, worldSpeed: game.forwardSpeed });
const reachBossOpening = () => {
  let dodged = false;
  for (let frames = 0; frames < 600 && game.run.phase === 'flying' && !game.boss.reactorOpen; frames++) {
    // Staged dodge after the real telegraph locks its aim. No enemy AI update
    // is disabled, and the Game still runs collision, attacks and progression.
    if (game.boss.battery.phase === 'warning' && !dodged) {
      game.ship.root.position.x = game.ship.root.position.x >= 0 ? -12 : 12;
      dodged = true;
    } else if (game.boss.battery.phase !== 'warning') dodged = false;
    step();
  }
  if (!game.boss.target) throw new Error(`Реактор не открылся: ${game.run.phase}/${game.boss.battery.phase}`);
  return game.boss.target;
};
const defeatBoss = () => {
  const openings: { opening: number; before: number; after: number; phase: string }[] = [];
  for (let cycle = 0; cycle < 3 && !game.boss.defeated; cycle++) {
    const reactor = reachBossOpening(), before = reactor.hp, opening = game.boss.battery.openings;
    // A deliberately overpowered synthetic hit goes through the real Game
    // callback. Its actual per-window cap still requires three attack cycles.
    sim.hitHostile(reactor, before, reactor.position);
    openings.push({ opening, before, after: reactor.hp, phase: game.boss.battery.phase });
  }
  if (!game.boss.defeated || openings.length !== 3) throw new Error(`Босс не прошёл три настоящих окна: ${game.boss.battery.phase}`);
  return openings;
};
const render = () => { game.scene.updateMatrixWorld(true); game.composer.render(); };
const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
type Check = { name: string; passed: boolean; details?: unknown };
const assumptions = {
  seed: 61723,
  timestep: DT,
  scenario: 'synthetic seeded integration cases with isolated rocks, staged actor positions and late-sector clocks',
  arsenal: 'all guns explicitly unlocked in fresh combat cases; no shop or human balance claim',
  bossVictory: 'overpowered synthetic Game.hitHostile hits in three real exposed windows; no forced phase or defeat flag',
  balanceClaim: false,
};

async function runChecks(): Promise<void> {
  runButton.disabled = previewButton.disabled = true;
  document.body.classList.remove('preview'); game.renderer.setAnimationLoop(null);
  const checks: Check[] = [];
  const record = (name: string, passed: boolean, details?: unknown) => checks.push({ name, passed, details });
  const progress = async () => {
    result.textContent = JSON.stringify({ running: true, assumptions, checks }, null, 2);
    await paint();
  };
  try {
    fresh();
    step(PIRATE_GRACE_SECONDS * 60 - 1);
    record('Настоящий Game не спавнит пиратов до 14 секунд', game.pirates.count === 0 && game.run.elapsed < PIRATE_GRACE_SECONDS,
      { seconds: game.run.elapsed, pirates: game.pirates.count });
    step(2);
    const fighter = game.pirates.enemies.find(enemy => enemy.active);
    record('После grace появляется настоящий истребитель из пула', !!fighter && fighter.kind === 'fighter' && fighter.root.visible && fighter.position.z < -100,
      { seconds: game.run.elapsed, kind: fighter?.kind, pirates: game.pirates.count });
    if (!fighter) throw new Error('Истребитель после grace не появился');
    for (let i = 0; i < 300 && !fighter.charging; i++) step();
    record('Истребитель предупреждает и фиксирует цель до выстрела', fighter.charging && fighter.attack.remaining > .75 && game.pirates.shotCount === 0,
      { warning: fighter.attack.remaining, lockedAim: fighter.lockedAim.toArray() });
    game.boss.spawn(3);
    const timers = { boss: game.boss.battery.remaining, fighter: fighter.attack.remaining, elapsed: game.run.elapsed, shots: game.pirates.shotCount };
    game.pause();
    for (let i = 0; i < 6; i++) { sim.lastFrame = performance.now() - 1000 / 60; sim.frame(); }
    record('Пауза через Game.frame замораживает флот, босса и время', game.run.phase === 'paused'
      && game.boss.battery.remaining === timers.boss && fighter.attack.remaining === timers.fighter
      && game.run.elapsed === timers.elapsed && game.pirates.shotCount === timers.shots, timers);
    await progress();

    fresh();
    fleetSim.projectiles.fire(new T.Vector3(0, 0, -12), game.ship.root.position, 'fighter', 1);
    step(12);
    record('Вражеский снаряд в настоящем Game снимает щит и исчезает', game.run.shield < 75 && game.run.hull === 100 && game.pirates.shotCount === 0,
      { shield: game.run.shield, hull: game.run.hull, shots: game.pirates.shotCount });
    fresh();
    const cover = syntheticRock(0, 0, 0, -14, 2, 'normal', 500);
    fleetSim.projectiles.fire(new T.Vector3(0, 0, -24), game.ship.root.position, 'sniper', 2);
    step(12);
    record('Движущийся астероид принимает вражеский выстрел раньше корпуса', game.run.shield === 75 && cover.hp === 500 && game.pirates.shotCount === 0 && cover.wait <= 0,
      { shield: game.run.shield, coverHP: cover.hp, shots: game.pirates.shotCount });

    fresh();
    const victim = syntheticEnemy(0, .43, -30, 14);
    aimAt(victim.position); sim.fire('pulse'); updateShots();
    game.pirates.hit(victim, 1000); sim.hitHostile(victim, 1000, victim.position);
    record('Импульсы реально уничтожают корабль и выдают одну награду', !victim.active && victim.hp === 0 && game.run.pirateKills === 1 && rewardTotal() === 12,
      { kills: game.run.pirateKills, oreInDrops: rewardTotal(), hp: victim.hp });
    sim.salvage.drops.forEach(drop => drop.mesh.position.copy(game.ship.root.position)); step();
    record('Руда за пиратский корабль собирается в настоящий баланс', game.run.ore === 12 && game.run.mined === 12 && sim.salvage.drops.length === 0,
      { ore: game.run.ore, mined: game.run.mined });

    fresh();
    const protectedEnemy = syntheticEnemy(0, .43, -35, 100);
    const armorRock = syntheticRock(0, 0, .43, -18, 3, 'armored', 500);
    aimAt(protectedEnemy.position); sim.fire('pulse'); updateShots();
    record('Обычные импульсы сначала попадают в астероид-укрытие', armorRock.hp < 500 && protectedEnemy.hp === 100,
      { rockHP: armorRock.hp, enemyHP: protectedEnemy.hp });

    fresh();
    const plasmaDirect = syntheticEnemy(0, .43, -30, 100);
    const plasmaNear = syntheticEnemy(4, .43, -30, 100);
    const plasmaFar = syntheticEnemy(18, .43, -30, 100);
    aimAt(plasmaDirect.position); sim.fire('plasma'); updateShots();
    const plasmaRemaining = 100 - WEAPONS.plasma.damage;
    record('Усиленная плазма повреждает прямую и соседнюю цели, дальняя цела', plasmaDirect.hp === plasmaRemaining && plasmaNear.hp < 100 && plasmaNear.hp > plasmaRemaining && plasmaFar.hp === 100,
      { directHP: plasmaDirect.hp, nearHP: plasmaNear.hp, farHP: plasmaFar.hp });

    fresh();
    const blastNear = syntheticEnemy(4, 0, -35, 100);
    const blastFar = syntheticEnemy(25, 0, -35, 100);
    sim.breakRock(syntheticRock(0, 0, 0, -35, 2, 'volatile'));
    record('Настоящий взрыв красного камня задевает близкий пиратский корабль', blastNear.hp > 0 && blastNear.hp < 100 && blastFar.hp === 100 && game.run.kills === 1,
      { nearHP: blastNear.hp, farHP: blastFar.hp, asteroidKills: game.run.kills });

    fresh();
    const cutEnemy = syntheticEnemy(0, .43, -60, 1000);
    const cutRock = syntheticRock(0, 0, .43, -25, 2, 'armored', 999);
    aimAt(cutRock.root.position); game.selectWeapon('cutter'); game.fireInput.press(1); step(); game.fireInput.clear();
    record('Резак мгновенно режет камень, кораблю наносит DPS один раз за кадр', cutRock.wait > 0 && game.run.kills === 1
      && cutEnemy.active && Math.abs(cutEnemy.hp - (1000 - BOSS_CUTTER_DPS * DT)) < 1e-6 && game.weapons.cutting,
      { asteroidHidden: cutRock.wait > 0, enemyHP: cutEnemy.hp, beamRemaining: game.weapons.remaining });
    await progress();

    fresh('expedition', 3); game.boss.spawn(3);
    const closed = game.boss.bodyTarget!;
    aimAt(closed.position); sim.fire('pulse'); updateShots(60);
    record('Закрытый реактор поглощает реальные снаряды без урона', closed.hp === bossMaxHealth(3) && game.boss.target === null && sim.projectiles.count === 0,
      { hp: closed.hp, shots: sim.projectiles.count, label: closed.label });
    game.selectWeapon('cutter'); game.autoFire = true; step();
    record('Автоогонь сохраняет резак на закрытом реакторе', !game.weapons.cutting && game.weapons.cooldown === 0 && game.boss.active);

    fresh('expedition', 3); game.boss.spawn(3); game.boss.update(7.2, bossContext());
    const openingArmor = game.boss.bodyTarget!; openingArmor.previousPosition?.copy(openingArmor.position);
    aimAt(openingArmor.position); sim.fire('plasma'); updateShots(60);
    game.selectWeapon('cutter'); game.fireInput.press(1); step(); game.fireInput.clear();
    record('Раскрывающаяся броня всё ещё защищает реактор от плазмы и настоящего луча', game.boss.reactorOpening
      && game.boss.target === null && openingArmor.hp === bossMaxHealth(3) && game.weapons.cutting,
      { hp: openingArmor.hp, phase: game.boss.battery.phase, label: openingArmor.label, beam: game.weapons.cutting });

    fresh('expedition', 3); game.run.sectorTime = 50; game.run.elapsed = 50;
    const reactor = reachBossOpening();
    const worldNode = game.boss.model.reactor.getWorldPosition(new T.Vector3());
    const openedAt = game.run.elapsed, initialWindow = game.boss.battery.remaining, initialHP = reactor.hp;
    record('Game открывает настоящий мировой узел реактора после залпа', game.boss.reactorOpen && game.boss.target === game.boss.bodyTarget
      && reactor.position.distanceTo(worldNode) < 1e-8 && Math.abs(initialWindow - 4) < DT * 1.01,
      { target: reactor.position.toArray(), localNode: game.boss.model.reactor.position.toArray(), window: initialWindow });
    aimAt(reactor.position); game.selectWeapon('cutter'); game.fireInput.press(1); step(); game.fireInput.clear(); step(108);
    const beamDamage = initialHP - reactor.hp;
    record('Полный резак наносит боссу около 324 урона за 1,8 с', reactor.hp > 0 && beamDamage >= BOSS_CUTTER_DPS * 1.8 - 3.01
      && beamDamage <= BOSS_CUTTER_DPS * 1.8 + 3.01 && !game.weapons.cutting && game.weapons.cooldown > 11.9,
      { damage: beamDamage, hp: reactor.hp, recharge: game.weapons.cooldown });
    for (let i = 0; i < 300 && game.boss.reactorOpen; i++) step();
    record('Реактор закрывается после четырёх игровых секунд', !game.boss.reactorOpen && Math.abs(game.run.elapsed - openedAt - BOSS_TIMINGS.exposed) <= DT * 1.01,
      { exposedSeconds: game.run.elapsed - openedAt, phase: game.boss.battery.phase });

    fresh('expedition', 3); game.run.sectorTime = 50; game.run.elapsed = 50;
    const overload = reachBossOpening(), fullHealth = overload.hp;
    sim.hitHostile(overload, fullHealth * 100, overload.position);
    const afterOverload = overload.hp;
    sim.hitHostile(overload, fullHealth * 100, overload.position);
    record('Одно окно принимает максимум 37% здоровья и сразу защищается при перегрузке', game.boss.reactorOverloaded
      && !game.boss.reactorOpen && !game.boss.defeated && overload.hp === afterOverload
      && Math.abs(fullHealth - afterOverload - fullHealth * BOSS_OPENING_DAMAGE_FRACTION) < 1e-7,
      { maxHP: fullHealth, hp: overload.hp, phase: game.boss.battery.phase, openings: game.boss.battery.openings });

    fresh('expedition', 3); game.run.sectorTime = SECTOR_SECONDS - DT / 2; game.run.elapsed = game.run.sectorTime;
    step(2); const heldSector = game.run.sector; game.nextSector();
    record('Живой босс удерживает переход после 75 с и прямой nextSector', game.run.phase === 'flying' && game.boss.active && game.run.sector === heldSector,
      { sector: game.run.sector, seconds: game.run.sectorTime, phase: game.run.phase });
    const heldOpenings = defeatBoss(); step();
    record('Победа над боссом открывает мастерскую и собирает ровно 100 руды', game.run.phase === 'upgrade' && game.run.bossKills === 1
      && game.run.ore === 100 && game.run.mined === 100 && game.boss.defeated,
      { phase: game.run.phase, bosses: game.run.bossKills, ore: game.run.ore, openings: heldOpenings });

    fresh('expedition', 3); game.run.sectorTime = 50; game.run.elapsed = 50;
    const earlyOpenings = defeatBoss();
    step(120);
    record('Убитый босс не спавнится повторно в том же секторе', game.run.phase === 'flying' && game.boss.defeated && !game.boss.active && game.run.bossKills === 1,
      { seconds: game.run.sectorTime, bosses: game.run.bossKills, defeated: game.boss.defeated, openings: earlyOpenings });
    await progress();

    fresh('expedition', 6); game.run.sectorTime = SECTOR_SECONDS - DT / 2; game.run.elapsed = 450;
    const finalOpenings = defeatBoss(); step();
    record('Шестой босс завершает конечную экспедицию настоящей победой', game.run.phase === 'ended' && game.run.won && game.run.sector === 6 && game.run.bossKills === 1,
      { mode: game.run.mode, phase: game.run.phase, won: game.run.won, openings: finalOpenings });

    fresh('endless', 6); game.run.sectorTime = SECTOR_SECONDS - DT / 2; game.run.elapsed = 450;
    const endlessOpenings = defeatBoss(); step();
    const workshopAtSix = game.run.phase === 'upgrade' && !game.run.won;
    game.nextSector(); clearRocks();
    const planet = game.scene.getObjectByName('Планета сектора') as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
    record('Бесконечный режим после шестого сектора реально начинает седьмой мир', workshopAtSix && game.run.phase === 'flying'
      && game.run.sector === 7 && game.run.mode === 'endless' && planet.material.map?.name === sectorVisual(visualSector(7, 'endless')).planet && game.forwardSpeed <= 52,
      { sector: game.run.sector, world: planet.material.map?.name, speed: game.forwardSpeed, openings: endlessOpenings });

    fresh('endless');
    const flyingBlocked = !game.extract(); game.pause(); const pausedBlocked = !game.extract(); game.resume();
    game.openArmory(); const armoryBlocked = !game.extract(); game.closeArmory();
    record('Эвакуация запрещена в полёте, на паузе и в оружейной', flyingBlocked && pausedBlocked && armoryBlocked && game.run.phase === 'flying');
    sim.salvage.dropReward(game.ship.root.position.clone(), 17, 3);
    game.run.sectorTime = SECTOR_SECONDS - DT / 2; step();
    const extracted = game.extract();
    record('Эвакуация из защищённой мастерской завершает забег с добычей', extracted && game.run.phase === 'ended' && game.run.won
      && game.run.ore === 17 && game.run.mined === 17,
      { extracted, phase: game.run.phase, ore: game.run.ore });

    fresh('endless', 3); syntheticEnemy(4, 0, -45);
    fleetSim.projectiles.fire(new T.Vector3(0, 0, -24), game.ship.root.position, 'fighter', 3);
    game.boss.spawn(3); game.boss.update(7.7, bossContext());
    game.weapons.select('cutter'); game.weapons.fire(game.run.fireInterval, true, false, true);
    game.run.ore = 200; game.run.pirateKills = 2; game.run.bossKills = 1;
    game.start('expedition');
    record('Рестарт сбрасывает флот, вражеские выстрелы, босса, оружие и результаты', game.pirates.count === 0 && game.pirates.shotCount === 0
      && !game.boss.active && !game.boss.defeated && game.boss.bodyTarget === null && game.run.pirateKills === 0
      && game.run.bossKills === 0 && game.run.ore === 0 && game.run.mined === 0 && game.weapons.selected === 'pulse'
      && WEAPON_ORDER.every(id => game.run.unlockedWeapons[id] === (id === 'pulse'))
      && game.weapons.cooldown === 0 && !game.weapons.cutting && game.run.mode === 'expedition' && game.run.sector === 1,
      { pirates: game.pirates.count, shots: game.pirates.shotCount, boss: game.boss.active, mode: game.run.mode, weapon: game.weapons.selected });
    game.returnToMenu();
    record('Возврат к выбору режима очищает бой и останавливает полёт', game.run.phase==='ready' && game.run.elapsed===0 && !game.boss.active && game.pirates.count===0 && game.pirates.shotCount===0);
    clearRocks(); game.pause(); render();
  } catch (error) {
    checks.push({ name: 'Проверка завершилась без исключений', passed: false, details: error instanceof Error ? error.message : String(error) });
    game.pause();
  }
  result.textContent = JSON.stringify({ passed: checks.every(check => check.passed), total: checks.length, assumptions, checks }, null, 2);
  runButton.disabled = previewButton.disabled = false;
}

runButton.onclick = () => { void runChecks(); };
previewButton.onclick = () => {
  document.body.classList.add('preview');
  fresh('endless', 3); sim.cosmos?.setSector(3);
  game.run.sectorTime = 50; game.run.elapsed = 200;
  syntheticRock(0, -13, 0, -25, 3, 'volatile'); syntheticRock(1, 13, 4, -44, 4, 'armored');
  game.boss.spawn(3); aimAt(game.boss.bodyTarget!.position); game.autoFire = true;
  sim.lastFrame = performance.now(); game.renderer.setAnimationLoop(() => sim.frame());
};

try {
  await game.init(({ percent, label }) => { result.textContent = `${Math.round(percent)}% · ${label}`; });
  game.renderer.setAnimationLoop(null);
  runButton.disabled = previewButton.disabled = false;
  result.textContent = 'Готово. Запустите проверку или покажите настоящий бой.';
} catch (error) {
  result.textContent = JSON.stringify({ passed: false, checks: [], error: error instanceof Error ? error.message : String(error) }, null, 2);
}
