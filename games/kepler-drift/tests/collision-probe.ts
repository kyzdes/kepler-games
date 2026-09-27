import { Game } from '../src/game';

// Development-only integration fixture. Exercise the real flight update and
// damage path with controlled rocks; publish every assertion in the visible UI.
const result = document.querySelector<HTMLPreElement>('#result')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const game = new Game(document.querySelector<HTMLElement>('#scene')!, {
  update() {}, phase() {}, toast() {}, help() {}, sound() {},
});
game.audio.toggle();
await game.init(({ percent, label }) => { result.textContent = `${Math.round(percent)}% · ${label}`; });
game.renderer.setAnimationLoop(null);
const simulation = game as unknown as { tickFlight(dt: number): void };
const step = (frames = 1) => {
  for (let i = 0; i < frames && game.run.phase === 'flying'; i++) simulation.tickFlight(1 / 60);
};
const clearRocks = () => game.rocks.forEach(rock => { rock.wait = 999; rock.root.visible = false; });
function freshRun(): void {
  game.start(); game.autoFire = false; clearRocks(); step(100);
}
function hit(x: number, y: number, z: number, radius = 1): void {
  const rock = game.rocks[0];
  rock.radius = radius; rock.root.scale.setScalar(radius);
  rock.root.position.set(x, y, z); rock.root.visible = true; rock.wait = 0;
  step();
}

button.disabled = false;
result.textContent = 'Готово. Проверка запускает настоящую симуляцию с контролируемыми столкновениями.';
button.onclick = () => {
  button.disabled = true;
  const checks: { name: string; passed: boolean; shield: number; hull: number; phase: string }[] = [];
  const record = (name: string, passed: boolean) => checks.push({ name, passed, shield: +game.run.shield.toFixed(2), hull: +game.run.hull.toFixed(2), phase: game.run.phase });

  freshRun(); hit(0, 0, 0);
  record('Прямой удар расходует щит', game.run.shield < 75 && game.run.hull === 100);
  freshRun(); hit(4.15, .25, 1.9, .65);
  record('Правое крыло получает урон', game.run.shield < 75);
  freshRun(); hit(-4.15, .25, 1.9, .65);
  record('Левое крыло получает урон', game.run.shield < 75);
  freshRun(); hit(0, 0, -4.1, .75);
  record('Нос корабля получает урон', game.run.shield < 75);
  freshRun(); hit(2, .1, 2.7, .75);
  record('Двигатель получает урон', game.run.shield < 75);
  freshRun(); hit(6.5, 0, 2);
  record('Безопасный пролёт не повреждает корабль', game.run.shield === 75 && game.run.hull === 100);

  freshRun(); game.boost(); hit(0, 0, 0);
  record('Рывок временно защищает от удара', game.run.shield === 75);
  clearRocks(); step(60); hit(0, 0, 0);
  record('После рывка урон снова проходит', game.run.shield < 75);

  freshRun(); hit(0, 0, 0);
  game.start(); clearRocks(); hit(0, 0, 0);
  record('Новая экспедиция сбрасывает прежнюю неуязвимость', game.run.shield < 75);

  freshRun();
  for (let i = 0; i < 3; i++) { hit(0, 0, 0, 3); clearRocks(); step(100); }
  record('Повторные удары пробивают щит и повреждают корпус', game.run.shield === 0 && game.run.hull < 100 && game.run.hull > 0);
  for (let i = 0; i < 3; i++) { hit(0, 0, 0, 3); clearRocks(); step(100); }
  record('Потеря корпуса завершает экспедицию поражением', game.run.hull === 0 && game.run.phase === 'ended' && !game.run.won);
  game.start(); clearRocks();
  record('После поражения восстанавливаются щит и корпус', game.run.shield === 75 && game.run.hull === 100 && game.run.phase === 'flying');

  game.pause(); game.composer.render();
  result.textContent = JSON.stringify({ passed: checks.every(check => check.passed), checks }, null, 2);
  button.disabled = false;
};
