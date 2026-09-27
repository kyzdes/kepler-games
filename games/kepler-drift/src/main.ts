import './style.css';
import { createIcons, Orbit, Gem, Shield, HeartPulse, Crosshair, Flame, Magnet, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowUpRight, ArrowRight, Play, RotateCcw, Wrench, ScanLine, Check, X, Mouse, Keyboard, ChevronRight } from 'lucide';
import type { Game } from './game';
import { LoadingScreen } from './loading';
import { BOOST_DURATION } from './boost';
import { SECTOR_SECONDS, SECTORS, TOTAL_SECTORS, UPGRADES, buyUpgrade, upgradeCost, rollUpgrades, WEAPON_UPGRADES } from './state';
import type { UpgradeId } from './state';

const iconSet = { Orbit, Gem, Shield, HeartPulse, Crosshair, Flame, Magnet, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowUpRight, ArrowRight, Play, RotateCcw, Wrench, ScanLine, Check, X, Mouse, Keyboard, ChevronRight };
const icons = () => createIcons({ icons: iconSet, attrs: { 'stroke-width': 1.5 } });
const icon = (name: string, cls = '') => `<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const time = (s: number) => `${pad(s / 60)}:${pad(s % 60)}`;
let best = 0;
try { const saved = Number(localStorage.getItem('kepler-best-v2')); if (Number.isFinite(saved) && saved >= 0) best = saved; } catch { /* A private browser can disable local storage. */ }

$('app').innerHTML = `
<main class="game-app" data-phase="ready">
  <div id="scene" class="scene"></div>
  <div class="lens-shade" aria-hidden="true"></div>
  <div id="damage-flash" class="damage-flash" aria-hidden="true"></div>
  <div class="frame-corner top-left" aria-hidden="true"></div><div class="frame-corner top-right" aria-hidden="true"></div>
  <div class="frame-corner bottom-left" aria-hidden="true"></div><div class="frame-corner bottom-right" aria-hidden="true"></div>
  <div id="hud" class="hud" hidden>
    <header class="flight-header">
      <div class="identity">${icon('orbit', 'brand-mark')}<div><div class="brand">КЕПЛЕР<span> : </span>ДРЕЙФ</div><div class="brand-subtitle">ОРБИТАЛЬНАЯ ЭКСПЕДИЦИЯ</div></div></div>
      <div class="route" aria-label="Прогресс экспедиции"><div id="route-stops" class="route-stops"><span class="current">1</span><b></b><span>2</span><b></b><span>3</span></div><div class="flight-time"><span id="flight-time">00:00</span><span class="time-divider">/</span>${time(SECTOR_SECONDS * TOTAL_SECTORS)}</div></div>
      <div class="header-right"><div class="ore-display">${icon('gem')}<div><span class="micro-label">РУДА</span><strong id="ore-value">0</strong></div><span id="ore-gain" class="ore-gain"></span></div><button id="armory-button" class="armory-button" title="Улучшить оружие · U" aria-label="Улучшить оружие за руду">${icon('crosshair')}<span>Оружие</span><kbd>U</kbd></button><div class="header-actions">
        <button id="sound-button" class="icon-button" aria-label="Выключить звук" title="Звук · M">${icon('volume-2')}</button>
        <button id="help-button" class="icon-button" aria-label="Управление" title="Управление · H">${icon('help-circle')}</button>
        <button id="fullscreen-button" class="icon-button fullscreen-button" aria-label="На весь экран" title="На весь экран · F">${icon('maximize')}</button>
        <button id="pause-button" class="icon-button" aria-label="Пауза" title="Пауза · Esc">${icon('pause')}</button>
      </div></div>
    </header>
    <div class="sector-info"><div class="sector-line"><span id="sector-number">СЕКТОР 01</span><span class="live-dot"></span><span id="sector-state">ОЖИДАНИЕ СТАРТА</span></div><h2 id="sector-name">ВНЕШНИЙ ПОЯС</h2><div class="sector-track"><span id="sector-progress"></span></div><div class="flight-readout"><span>СКОРОСТЬ <b id="flight-speed">18</b> М/С</span><span>БОЧКА <b id="roll-status">ГОТОВА</b></span></div><div class="roll-shortcut"><kbd>A / D</kbd><span>+</span><kbd>ПРОБЕЛ</kbd><span>БОЧКА</span></div></div>
    <div id="reticle" class="reticle" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="23" stroke-dasharray="22 14"/><path d="M32 2v7M32 55v7M2 32h7M55 32h7"/><circle class="reticle-dot" cx="32" cy="32" r="1.4"/></svg></div>
    <div id="target-info" class="target-info" hidden><span id="target-label">РУДНЫЙ АСТЕРОИД</span><div><i id="target-health"></i></div></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div class="ship-status"><div class="status-row">${icon('shield')}<div class="status-data"><div class="status-label"><span>ЩИТ</span><span><b id="shield-value">75</b><small id="shield-max"> / 75</small></span></div><div class="status-track shield-track"><i id="shield-fill"></i></div></div></div><div class="status-row">${icon('heart-pulse')}<div class="status-data"><div class="status-label"><span>КОРПУС</span><span><b id="hull-value">100</b><small> / 100</small></span></div><div class="status-track hull-track"><i id="hull-fill"></i></div></div></div><div class="ship-id"><span class="live-dot"></span>KEP–01<span>РАЗВЕДЧИК</span></div></div>
    <div class="equipment" aria-label="Системы корабля">
      <button id="weapon-button" class="equipment-slot" aria-label="Выключить автоогонь" aria-pressed="true" title="Переключить автоогонь · Q"><span class="equipment-key">Q</span>${icon('crosshair')}<span class="equipment-name">ЛАЗЕР <b id="laser-level">I</b></span><span id="fire-status" class="equipment-status">АВТООГОНЬ · Q</span><i class="equipment-line orange-line"></i></button>
      <button id="boost-button" class="equipment-slot" title="Форсаж на 6 секунд · Shift"><span class="equipment-key">SHIFT</span>${icon('flame')}<span class="equipment-name">ФОРСАЖ <b id="engine-level">I</b></span><span id="boost-status" class="equipment-status">ГОТОВ</span><i id="boost-fill" class="equipment-line blue-line"></i></button>
      <div class="equipment-slot passive" title="Руда притягивается автоматически"><span class="equipment-key">АВТО</span>${icon('magnet')}<span class="equipment-name">МАГНИТ <b id="magnet-level">I</b></span><span class="equipment-status">АКТИВЕН</span><i class="equipment-line gold-line"></i></div>
    </div>
    <div class="radar-wrap"><div class="radar-top"><span>СКАНЕР</span><span>120 М</span></div><canvas id="radar" width="320" height="320" aria-label="Радар астероидов перед кораблём"></canvas><div class="radar-legend"><i></i>РУДА<span></span>АСТЕРОИД</div></div>
    <footer class="flight-footer"><span class="controls-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> МАНЁВР<span class="hint-divider"></span><kbd>ЛКМ</kbd> ОГОНЬ<span class="hint-divider"></span><kbd>SHIFT</kbd> ФОРСАЖ</span><span class="objective">Пройдите пояс. Сохраните корабль.</span><span class="version-label">ЭКСПЕДИЦИЯ 01</span></footer>
    <div class="touch-controls"><div id="joystick" class="joystick" aria-label="Маневрирование"><div id="joystick-knob"></div></div><div class="touch-right"><div class="touch-maneuvers"><button id="touch-roll" aria-label="Бочка в сторону джойстика">${icon('rotate-ccw')}<span>БОЧКА</span></button><button id="touch-boost" aria-label="Форсаж на 6 секунд">${icon('flame')}</button></div><button id="touch-fire" aria-label="Стрелять">${icon('crosshair')}<span>ОГОНЬ</span></button></div></div>
  </div>
  <section id="intro" class="intro" hidden><div class="intro-panel"><h1>Кеплер:<br/><span>Дрейф</span></h1><p>На краю известного космоса<br/>богатство скрывается в камне.</p><div class="expedition-details"><span>3 СЕКТОРА</span><i></i><span>ОДНА ПОПЫТКА</span></div><button id="launch-button" class="primary-button">Начать экспедицию ${icon('arrow-up-right')}</button><button id="intro-help" class="text-button">${icon('keyboard')} Управление</button><div id="best-start" class="best-start"></div></div><div class="intro-caption"><span></span>ПОЯС КЕПЛЕРА<br/><small>Внешняя граница исследованного пространства</small></div></section>
  <div id="overlay" class="overlay" hidden></div>
</main>`;
icons();
let game: Game;
let offer: UpgradeId[] = [];
let purchased = new Set<UpgradeId>();
let toastTimer: ReturnType<typeof setTimeout>;
let lastOre = 0;
let gainTimer: ReturnType<typeof setTimeout>;
let helpOpen = false;
let resumeAfterHelp = false;
let armoryFeedback = '';
let weaponHintShown = false;
const overlay = $('overlay');
const root = document.querySelector('.game-app') as HTMLElement;
const radarContext = ($('radar') as HTMLCanvasElement).getContext('2d')!;

function toast(message: string): void { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000); }
function sound(muted: boolean): void { $('sound-button').innerHTML = icon(muted ? 'volume-x' : 'volume-2'); $('sound-button').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук'); icons(); }
function setText(id: string, value: string): void { const e = $(id); if (e.textContent !== value) e.textContent = value; }
function update(g: Game): void {
  const r = g.run;
  setText('ore-value', r.ore.toLocaleString('ru-RU'));
  if (r.ore > lastOre && r.phase === 'flying') { $('ore-gain').textContent = `+${r.ore - lastOre}`; $('ore-gain').classList.add('show'); clearTimeout(gainTimer); gainTimer = setTimeout(() => $('ore-gain').classList.remove('show'), 1000); }
  lastOre = r.ore;
  setText('flight-time', time(r.elapsed)); setText('shield-value', String(Math.ceil(r.shield))); setText('shield-max', ` / ${r.maxShield}`); setText('hull-value', String(Math.ceil(r.hull)));
  $('shield-fill').style.transform = `scaleX(${r.shield / r.maxShield})`; $('hull-fill').style.transform = `scaleX(${r.hull / 100})`;
  $('hull-fill').classList.toggle('critical', r.hull < 30);
  $('sector-progress').style.transform = `scaleX(${r.sectorTime / SECTOR_SECONDS})`;
  $('boost-fill').style.transform = `scaleX(${g.boostTime>0 ? g.boostTime/BOOST_DURATION : 1-g.boostCooldown/r.boostCooldown})`;
  setText('flight-speed', String(Math.round(g.forwardSpeed)));
  setText('roll-status', g.roll.active ? 'ВРАЩЕНИЕ' : g.roll.cooldown > 0 ? `${g.roll.cooldown.toFixed(1)} С` : 'ГОТОВА');
  $('roll-status').classList.toggle('recharging', g.roll.cooldown > 0);
  ($('touch-roll') as HTMLButtonElement).disabled = g.roll.cooldown > 0;
  setText('boost-status', g.boostTime>0 ? `ФОРСАЖ ${g.boostTime.toFixed(1)} С` : g.boostCooldown>0 ? `ЗАРЯД ${g.boostCooldown.toFixed(1)} С` : 'ГОТОВ · 6 С');
  $('boost-button').classList.toggle('boosting',g.boostTime>0);
  for(const id of ['boost-button','touch-boost']) ($(id) as HTMLButtonElement).disabled=g.boostTime>0 || g.boostCooldown>0;
  const affordable=WEAPON_UPGRADES.some(id=>!(id==='multishot' && r.multishot) && r.ore>=upgradeCost(r,id));
  $('armory-button').classList.toggle('affordable',affordable);
  if(!weaponHintShown && affordable && r.phase==='flying') { weaponHintShown=true; toast('Руды хватит на улучшение. Откройте «Оружие» · U.'); }
  $('boost-button').classList.toggle('cooldown', g.boostCooldown > 0);
  $('weapon-button').classList.toggle('active', g.autoFire); $('weapon-button').setAttribute('aria-pressed', String(g.autoFire)); $('weapon-button').setAttribute('aria-label', g.autoFire ? 'Выключить автоогонь' : 'Включить автоогонь');
  setText('fire-status', g.autoFire ? 'АВТООГОНЬ · Q' : 'РУЧНОЙ ОГОНЬ');
  const numerals = ['0', 'I', 'II', 'III', 'IV', 'V'];
  for (const id of ['laser', 'engine', 'magnet'] as const) setText(`${id}-level`, numerals[r.levels[id]] || String(r.levels[id]));
  $('damage-flash').style.opacity = String(g.damageFlash * .48);
  $('reticle').style.left = `${(g.pointer.x + 1) * 50}%`; $('reticle').style.top = `${(1 - g.pointer.y) * 50}%`; $('reticle').classList.toggle('locked', !!g.target);
  const target = g.targetScreen(); $('target-info').hidden = !target;
  if (target) { $('target-info').style.left = `${target.x}px`; $('target-info').style.top = `${target.y}px`; $('target-health').style.transform = `scaleX(${Math.max(0, target.health)})`; setText('target-label', target.ore ? 'РУДНЫЙ АСТЕРОИД' : 'СИЛИКАТНЫЙ АСТЕРОИД'); }
  drawRadar(g);
}

function drawRadar(g: Game): void {
  const ctx = radarContext; ctx.clearRect(0, 0, 320, 320); ctx.save(); ctx.translate(160, 160);
  ctx.fillStyle = 'rgba(5,16,26,.35)'; ctx.beginPath(); ctx.arc(0, 0, 140, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(157,198,223,.23)';
  for (const r of [48, 94, 140]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-148, 0); ctx.lineTo(148, 0); ctx.moveTo(0, -148); ctx.lineTo(0, 148); ctx.stroke();
  ctx.strokeStyle = 'rgba(157,198,223,.4)'; ctx.setLineDash([2, 15]); ctx.beginPath(); ctx.arc(0, 0, 147, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  for (const rock of g.rocks) {
    if (rock.wait > 0 || rock.root.position.z < -120 || rock.root.position.z > 12) continue;
    const x = (rock.root.position.x - g.ship.root.position.x) * 3.5, y = rock.root.position.z * 1.02 + 50;
    if (Math.hypot(x, y) > 132) continue;
    ctx.fillStyle = rock.ore ? '#eab66e' : '#738995'; ctx.globalAlpha = .45 + (1 + rock.root.position.z / 120) * .5;
    ctx.beginPath(); ctx.arc(x, y, rock.radius > 3 ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.fillStyle = '#d2efff'; ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(-7, 59); ctx.lineTo(0, 54); ctx.lineTo(7, 59); ctx.closePath(); ctx.fill(); ctx.restore();
}

function showOverlay(html: string, label: string): void {
  overlay.innerHTML = html; overlay.hidden = false; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', label); icons();
  requestAnimationFrame(() => overlay.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
}
function phase(g: Game): void {
  root.dataset.phase = g.run.phase;
  $('intro').hidden = g.run.phase !== 'ready';
  $('pause-button').hidden = ['ready','ended','upgrade','armory'].includes(g.run.phase);
  $('armory-button').hidden = !['flying','paused'].includes(g.run.phase);
  if(g.run.phase==='flying' && g.run.elapsed===0) { weaponHintShown=false; armoryFeedback=''; }
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
