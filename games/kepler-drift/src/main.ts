import { $, icon, icons, pad, time, setText } from './ui/dom';
import { mountApp } from './ui/shell';
import { createFlightHud } from './ui/hud';
import './style.css';
import type { Game } from './game';
import { LoadingScreen } from './loading';
import { SECTORS, TOTAL_SECTORS, UPGRADES, buyUpgrade, upgradeCost, rollUpgrades, WEAPON_UPGRADES } from './state';
import type { UpgradeId } from './state';

let best = 0;
try { const saved = Number(localStorage.getItem('kepler-best-v2')); if (Number.isFinite(saved) && saved >= 0) best = saved; } catch { /* A private browser can disable local storage. */ }

mountApp();
let game: Game;
let offer: UpgradeId[] = [];
let purchased = new Set<UpgradeId>();
let toastTimer: ReturnType<typeof setTimeout>;
let helpOpen = false;
let resumeAfterHelp = false;
let armoryFeedback = '';
const overlay = $('overlay');
const root = document.querySelector('.game-app') as HTMLElement;

function toast(message: string): void { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000); }
function sound(muted: boolean): void { $('sound-button').innerHTML = icon(muted ? 'volume-x' : 'volume-2'); $('sound-button').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук'); icons(); }
const { update, resetWeaponHint } = createFlightHud(toast);

function showOverlay(html: string, label: string): void {
  overlay.innerHTML = html; overlay.hidden = false; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', label); icons();
  requestAnimationFrame(() => overlay.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
}
function phase(g: Game): void {
  root.dataset.phase = g.run.phase;
  $('intro').hidden = g.run.phase !== 'ready';
  $('pause-button').hidden = ['ready','ended','upgrade','armory'].includes(g.run.phase);
  $('armory-button').hidden = !['flying','paused'].includes(g.run.phase);
  if(g.run.phase==='flying' && g.run.elapsed===0) { resetWeaponHint(); armoryFeedback=''; }
  setText('sector-number', `СЕКТОР ${pad(g.run.sector)}`); setText('sector-name', SECTORS[g.run.sector - 1]);
  setText('sector-state', g.run.phase === 'ready' ? 'ОЖИДАНИЕ СТАРТА' : ['paused','armory'].includes(g.run.phase) ? 'ПАУЗА' : 'В ПОЛЁТЕ');
  $('route-stops').querySelectorAll('span').forEach((e, i) => { e.classList.toggle('current', i + 1 === g.run.sector); e.classList.toggle('complete', i + 1 < g.run.sector); });
  if (g.run.phase === 'paused' && !helpOpen) {
    showOverlay(`<section class="pause-panel"><div class="panel-symbol">${icon('pause')}</div><h1>Держим позицию.</h1><p>Космос подождёт.<br/>Экспедиция продолжится с этого места.</p><button id="resume-button" class="primary-button">Продолжить полёт ${icon('play')}</button><button id="restart-button" class="secondary-button">Начать заново ${icon('rotate-ccw')}</button><button id="pause-help" class="text-button">Управление</button></section>`, 'Пауза');
    $('resume-button').onclick = () => g.resume(); $('restart-button').onclick = () => g.start(); $('pause-help').onclick = showHelp;
  } else if (g.run.phase === 'upgrade') { offer = rollUpgrades(g.run); purchased = new Set(); renderShop(); }
  else if (g.run.phase === 'armory' && !helpOpen) { armoryFeedback=''; renderArmory(); }
  else if (g.run.phase === 'ended') showEnd();
  else if (!helpOpen) { overlay.hidden = true; overlay.innerHTML = ''; }
  update(g);
}

function renderShop(): void {
  const r = game.run;
  showOverlay(`<section class="shop-panel"><div class="shop-heading"><div><h1>Сектор пройден.</h1><p>Превратите добычу в преимущество перед следующим прыжком.</p></div><div class="shop-balance">${icon('gem')}<strong>${r.ore}</strong><span>ДОСТУПНО РУДЫ</span></div></div><div class="upgrade-grid">${offer.map(id => {
    const u = UPGRADES[id], cost = upgradeCost(r, id), installed = purchased.has(id), full = id === 'repair' && r.hull === r.maxHull && r.shield === r.maxShield, disabled = installed || full || r.ore < cost;
    return `<article class="upgrade-card ${u.color} ${installed ? 'installed' : ''}"><div class="module-visual">${icon(installed ? 'check' : u.icon)}<span class="module-orbit"></span><span class="module-orbit second"></span></div><h2>${u.name}</h2><div class="module-level">${installed ? 'МОДУЛЬ УСТАНОВЛЕН' : id === 'repair' ? `КОРПУС ${Math.ceil(r.hull)} / 100` : `УРОВЕНЬ ${r.levels[id]} → ${r.levels[id] + 1}`}</div><p>${u.description}</p><button class="upgrade-buy" data-upgrade="${id}" ${disabled ? 'disabled' : ''}>${installed ? `${icon('check')} Установлено` : full ? 'Ремонт не требуется' : r.ore < cost ? `Нужно ещё ${cost - r.ore} руды` : `Установить <span>${icon('gem')} ${cost}</span>`}</button></article>`;
  }).join('')}</div><div class="shop-footer"><p>${icon('shield')} Щит восстановится при переходе.<br/><span>Руда сохраняется до конца экспедиции.</span></p><button id="next-sector" class="primary-button">В сектор ${r.sector + 1} ${icon('arrow-right')}</button></div></section>`, 'Мастерская корабля');
  overlay.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(button => button.onclick = () => {
    const id = button.dataset.upgrade as UpgradeId;
    if (purchased.has(id) || !buyUpgrade(game.run, id)) return;
    purchased.add(id); game.audio.upgrade(); renderShop(); update(game);
  });
  $('next-sector').onclick = () => game.nextSector();
}

function renderArmory(): void {
  const r=game.run;
  const damage=(value:number)=>Number(value.toFixed(1)).toLocaleString('ru-RU');
  showOverlay(`<section class="shop-panel armory-panel">
    <div class="shop-heading"><div><h1>Оружие корабля.</h1><p>Улучшайте за собранную руду.<br/>Полёт на паузе.</p></div><div class="shop-balance">${icon('gem')}<strong id="armory-ore">${r.ore}</strong><span>ДОСТУПНО РУДЫ</span></div></div>
    <div class="upgrade-grid armory-grid">${WEAPON_UPGRADES.map(id=>{
      const u=UPGRADES[id], cost=upgradeCost(r,id), installed=id==='multishot' && r.multishot;
      return `<article class="upgrade-card ${u.color} ${installed?'installed':''}">
        <div class="module-visual">${icon(installed?'check':u.icon)}<span class="module-orbit"></span><span class="module-orbit second"></span></div>
        <h2>${u.name}</h2><div class="module-level">${id==='laser'?`УРОВЕНЬ ${r.levels.laser} → ${r.levels.laser+1}`:installed?'УСТАНОВЛЕН':'ЗАЛП ×3'}</div>
        <p>${id==='laser'?`Урон ${damage(r.damage)} → ${damage(r.damage*1.35)}. Каждый выстрел сильнее на 35%.`:'Три луча из каждого ствола. Раскалывайте больше астероидов за залп.'}</p>
        <div class="armory-price">${installed?'Модуль активен':`${icon('gem')} ${cost} руды`}</div>
        <button class="upgrade-buy" data-weapon="${id}" ${installed||r.ore<cost?'disabled':''} aria-label="${installed?'Тройной импульс установлен':`${id==='laser'?'Улучшить лазер':'Установить тройной импульс'} за ${cost} руды`}">${installed?`${icon('check')} Установлено`:r.ore<cost?`Нужно ещё ${cost-r.ore} руды`:`${id==='laser'?'Улучшить лазер':'Установить'} ${icon('arrow-up-right')}`}</button>
      </article>`;
    }).join('')}</div>
    <p class="armory-feedback" role="status" aria-live="polite">${armoryFeedback}</p>
    <div class="shop-footer"><p>Оборудование сохраняется до конца забега.<br/><span>Остальные системы — в мастерской между секторами.</span></p><button id="close-armory" class="primary-button">${game.armoryReturnsToPause?'К паузе':'К полёту'} ${icon('play')}</button></div>
  </section>`, 'Улучшение оружия');
  overlay.querySelectorAll<HTMLButtonElement>('[data-weapon]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.weapon as 'laser'|'multishot';
    if(!buyUpgrade(game.run,id)) return;
    game.audio.upgrade();
    armoryFeedback=id==='laser'?`Лазер улучшен до уровня ${game.run.levels.laser}. Урон увеличен.`:'Тройной импульс установлен. Каждый ствол выпускает три луча.';
    renderArmory(); update(game);
    requestAnimationFrame(()=>{
      const next=overlay.querySelector<HTMLButtonElement>(`[data-weapon="${id}"]:not(:disabled)`);
      (next ?? $('close-armory')).focus();
    });
  });
  $('close-armory').onclick=()=>game.closeArmory();
}

function showEnd(): void {
  const r = game.run; const newBest = r.mined > best;
  if (newBest) { best = r.mined; try { localStorage.setItem('kepler-best-v2', String(best)); } catch { /* Gameplay works without persistence. */ } }
  showOverlay(`<section class="end-panel"><div class="panel-symbol ${r.won ? 'success' : ''}">${icon(r.won ? 'orbit' : 'shield')}</div><h1>${r.won ? 'За поясом — звёзды.' : 'Сигнал потерян.'}</h1><p>${r.won ? 'Три сектора позади. Груз доставлен, корабль уцелел.' : 'Корабль остался среди астероидов.<br/>Следующий полёт будет другим.'}</p><dl class="run-results"><div><dt>ДОБЫТО РУДЫ</dt><dd class="gold-text">${r.mined}</dd></div><div><dt>АСТЕРОИДОВ</dt><dd>${r.kills}</dd></div><div><dt>ВРЕМЯ ПОЛЁТА</dt><dd>${time(r.elapsed)}</dd></div></dl><div class="result-note">${newBest ? 'Новый рекорд экспедиции' : `Рекорд: ${best} руды`}<span>Сектор ${r.sector} / ${TOTAL_SECTORS}</span></div><button id="new-run" class="primary-button">Новая экспедиция ${icon('arrow-up-right')}</button></section>`, 'Результаты экспедиции');
  $('new-run').onclick = () => game.start();
}

function showHelp(): void {
  if (helpOpen) return;
  helpOpen = true; resumeAfterHelp = game.run.phase === 'flying'; if (resumeAfterHelp) game.pause();
  showOverlay(`<section class="help-panel"><button id="close-help" class="icon-button close-button" aria-label="Закрыть управление">${icon('x')}</button><h1>Ваш первый полёт.</h1><p>Разбивайте астероиды с золотыми жилами. Собранная руда оплачивает усиление лазера и тройной выстрел. Кнопка «Оружие» или U открывает улучшения и ставит полёт на паузу.</p><dl class="control-list"><div><dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>или стрелки</span></dt><dd>Маневрировать</dd></div><div><dt>${icon('mouse')}<span>Мышь</span></dt><dd>Наводить прицел</dd></div><div><dt><kbd>ЛКМ</kbd></dt><dd>Ручной огонь · удерживать</dd></div><div><dt><kbd>A / D</kbd><span>+</span><kbd>ПРОБЕЛ</kbd></dt><dd>Бочка в сторону манёвра</dd></div><div><dt><kbd>SHIFT</kbd></dt><dd>Форсаж 6 секунд · краткая защита в начале</dd></div><div><dt><kbd>U</kbd></dt><dd>Улучшить оружие за руду</dd></div><div><dt><kbd>Q</kbd></dt><dd>Автоогонь · включён при старте</dd></div><div><dt><kbd>ESC</kbd><span>/</span><kbd>M</kbd></dt><dd>Пауза / звук</dd></div></dl><p class="help-footnote">Магнит собирает руду поблизости автоматически. Щит восстанавливается через 5 секунд без столкновений. Для бочки отклоните джойстик в сторону и нажмите кнопку бочки. Руда: 3–10 из золотых астероидов, 1–2 из обычных.</p><button id="help-done" class="primary-button">Всё понятно ${icon('arrow-right')}</button></section>`, 'Управление');
  const close = () => { helpOpen = false; if (resumeAfterHelp) game.resume(); else if (game.run.phase === 'upgrade') renderShop(); else if(game.run.phase==='armory') renderArmory(); else phase(game); };
  $('close-help').onclick = close; $('help-done').onclick = close;
}

async function fullscreen(): Promise<void> { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { toast('Полноэкранный режим недоступен в этом браузере.'); } }

function bindUI(): void {
  window.addEventListener('keydown', e => {
    if (helpOpen && e.code==='KeyU') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (helpOpen && ['Escape', 'KeyH', 'KeyP'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); $('close-help')?.click(); }
  }, true);
  $('launch-button').onclick = () => game.start(); $('intro-help').onclick = showHelp; $('help-button').onclick = showHelp;
  $('sound-button').onclick = () => sound(game.audio.toggle()); $('fullscreen-button').onclick = fullscreen; $('pause-button').onclick = () => game.togglePause();
  $('armory-button').onclick = () => game.openArmory();
  $('weapon-button').onclick = () => game.toggleAutoFire(); $('boost-button').onclick = () => game.boost(); $('touch-boost').onclick = () => game.boost();
  $('touch-roll').onclick = () => { if (!game.barrelRoll() && Math.abs(game.touchMove.x) < .15) toast('Отклоните джойстик влево или вправо для бочки.'); };
  $('best-start').textContent = best > 0 ? `Рекорд экспедиции · ${best} руды` : '';
  $('touch-fire').addEventListener('pointerdown', e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); game.fireInput.press(e.pointerId); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-fire').addEventListener(event, e => game.fireInput.release((e as PointerEvent).pointerId));
  const joystick = $('joystick'); let joystickActive = false;
  const move = (e: PointerEvent) => { if (!joystickActive) return; const r = joystick.getBoundingClientRect(), x = (e.clientX - r.left - r.width / 2) / (r.width * .35), y = -(e.clientY - r.top - r.height / 2) / (r.height * .35); game.touchMove.set(x, y).clampLength(0, 1); $('joystick-knob').style.transform = `translate(${game.touchMove.x * 30}px,${-game.touchMove.y * 30}px)`; };
  joystick.addEventListener('pointerdown', e => { e.preventDefault(); joystick.setPointerCapture(e.pointerId); joystickActive = true; move(e); }); joystick.addEventListener('pointermove', move);
  const stop = () => { joystickActive = false; game.touchMove.set(0, 0); $('joystick-knob').style.transform = ''; };
  joystick.addEventListener('pointerup', stop); joystick.addEventListener('pointercancel', stop); joystick.addEventListener('lostpointercapture', stop);
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyF' && !e.repeat) void fullscreen();
    if (e.code === 'Tab' && !overlay.hidden) {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
}

async function boot(): Promise<void> {
  const loading = new LoadingScreen();
  try {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('loading-preview')) {
      await loading.prepare();
      if (new URLSearchParams(location.search).get('loading-preview') === 'error') loading.fail();
      else loading.update({ percent:62, stage:1, label:'Создаём пояс астероидов' });
      return;
    }
    const [{ Game }] = await Promise.all([import('./game'), loading.prepare()]);
    game = new Game($('scene'), { update, phase, toast, help: showHelp, sound });
    await game.init(loading.update); bindUI(); $('hud').hidden = false; phase(game);
    await loading.finish();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('sector-preview')) {
      const { previewSector } = await import('../tests/sector-preview');
      previewSector(game);
    }
  } catch (error) {
    console.error('Unable to start Kepler Drift', error);
    loading.fail();
  }
}
void boot();
