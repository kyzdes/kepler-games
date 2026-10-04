import { $, icon, icons } from './dom';
import { TOTAL_SECTORS } from '../state';
import { WEAPON_ORDER, WEAPONS } from '../weapons';

export function mountApp(): void {
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
      <div class="route" aria-label="Прогресс экспедиции"><div id="route-stops" class="route-stops">${Array.from({length: TOTAL_SECTORS}, (_, i) => `${i ? '<b></b>' : ''}<span class="${i === 0 ? 'current' : ''}">${i + 1}</span>`).join('')}</div><div class="flight-time"><span id="flight-time">00:00</span><span class="time-divider">/</span><span id="flight-limit">${TOTAL_SECTORS} СЕКТОРОВ</span></div></div>
      <div class="header-right"><div class="ore-display">${icon('gem')}<div><span class="micro-label">РУДА</span><strong id="ore-value">0</strong></div><span id="ore-gain" class="ore-gain"></span></div><button id="weapon-button" class="auto-fire-button active" aria-label="Выключить автоогонь" aria-pressed="true" title="Переключить автоогонь · Q">${icon('crosshair')}<span id="fire-status">АВТО</span></button><button id="armory-button" class="armory-button" title="Улучшить оружие · U" aria-label="Улучшить оружие за руду">${icon('wrench')}<span>Оружие</span><kbd>U</kbd></button><div class="header-actions">
        <button id="sound-button" class="icon-button" aria-label="Выключить звук" title="Звук · M">${icon('volume-2')}</button>
        <button id="help-button" class="icon-button" aria-label="Управление" title="Управление · H">${icon('help-circle')}</button>
        <button id="fullscreen-button" class="icon-button fullscreen-button" aria-label="На весь экран" title="На весь экран · F">${icon('maximize')}</button>
        <button id="view-button" class="view-button" aria-label="Переключить камеру · C" title="Кабина / вид сзади · C" hidden><span id="view-label">КАБИНА</span><kbd>C</kbd></button>
        <button id="pause-button" class="icon-button" aria-label="Пауза" title="Пауза · Esc">${icon('pause')}</button>
      </div></div>
    </header>
    <div class="sector-info"><div class="sector-line"><span id="sector-number">СЕКТОР 01</span><span class="live-dot"></span><span id="sector-state">ОЖИДАНИЕ СТАРТА</span></div><h2 id="sector-name">ВНЕШНИЙ ПОЯС</h2><div class="sector-track"><span id="sector-progress"></span></div><div id="sector-hint" class="sector-hint">Золотые жилы · собирайте руду</div><div class="flight-readout"><span>СКОРОСТЬ <b id="flight-speed">18</b> М/С</span><span>БОЧКА <b id="roll-status">ГОТОВА</b></span></div><div id="encounter-info" class="encounter-info" hidden></div><div class="roll-shortcut"><kbd>A / D</kbd><span>+</span><kbd>ПРОБЕЛ</kbd><span>БОЧКА</span></div></div>
    <div id="hazard-warning" class="hazard-warning" role="status" hidden>${icon('shield')}<span>ВЗРЫВНОЙ АСТЕРОИД РЯДОМ<br/><small>Уходите в сторону. Огонь вызовет взрыв.</small></span></div>
    <section id="boss-hud" class="boss-hud" aria-label="Добывающий корабль" hidden><div class="boss-heading"><strong>СЕРДЦЕ КАРЬЕРА</strong><span id="boss-health-value"></span></div><div id="boss-health" class="boss-health" role="progressbar" aria-label="Прочность босса" aria-valuemin="0" aria-valuemax="100"><i id="boss-health-fill"></i></div><p id="boss-state"></p></section>
    <div id="steering-cursor" class="steering-cursor" aria-hidden="true" hidden></div>
    <div id="free-instruments" class="free-instruments" hidden><span>ТЯГА <b id="throttle-value">65%</b></span><span id="mining-contract">КОНТРАКТ · 0 / 40 РУДЫ</span></div>
    <div id="reticle" class="reticle" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="23" stroke-dasharray="22 14"/><path d="M32 2v7M32 55v7M2 32h7M55 32h7"/><circle class="reticle-dot" cx="32" cy="32" r="1.4"/></svg></div>
    <div id="target-info" class="target-info" hidden><span id="target-label">РУДНЫЙ АСТЕРОИД</span><div><i id="target-health"></i></div></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <div class="ship-status"><div class="status-row">${icon('shield')}<div class="status-data"><div class="status-label"><span>ЩИТ</span><span><b id="shield-value">75</b><small id="shield-max"> / 75</small></span></div><div class="status-track shield-track"><i id="shield-fill"></i></div></div></div><div class="status-row">${icon('heart-pulse')}<div class="status-data"><div class="status-label"><span>КОРПУС</span><span><b id="hull-value">100</b><small> / 100</small></span></div><div class="status-track hull-track"><i id="hull-fill"></i></div></div></div><div class="ship-id"><span class="live-dot"></span>KEP–01<span>РАЗВЕДЧИК</span></div></div>
    <div class="equipment" aria-label="Системы корабля">
      ${WEAPON_ORDER.map(id => `<button id="select-${id}" class="equipment-slot weapon-choice ${id === 'pulse' ? 'selected' : 'weapon-locked'}" data-weapon-id="${id}" aria-label="${id === 'pulse' ? `${WEAPONS[id].name} · оружие ${WEAPONS[id].key}` : `${WEAPONS[id].name}: открыть за ${WEAPONS[id].cost} руды`}" aria-pressed="${id === 'pulse'}" title="${WEAPONS[id].description} · ${WEAPONS[id].key}"><span class="equipment-key">${WEAPONS[id].key}</span>${icon(WEAPONS[id].icon)}<span class="equipment-name">${WEAPONS[id].name.toUpperCase()}${id === 'pulse' ? ' <b id="laser-level">I</b>' : ''}</span><span id="${id}-status" class="equipment-status">${id === 'pulse' ? 'ТОЧНЫЙ ОГОНЬ' : `${WEAPONS[id].cost} РУДЫ · U`}</span><i ${id === 'cutter' ? 'id="cutter-fill"' : ''} class="equipment-line ${id}-line"></i></button>`).join('')}
      <button id="boost-button" class="equipment-slot" title="Форсаж на 6 секунд · Shift"><span class="equipment-key">SHIFT</span>${icon('flame')}<span class="equipment-name">ФОРСАЖ <b id="engine-level">I</b></span><span id="boost-status" class="equipment-status">ГОТОВ</span><i id="boost-fill" class="equipment-line blue-line"></i></button>
      <div class="equipment-slot passive" title="Руда притягивается автоматически"><span class="equipment-key">АВТО</span>${icon('magnet')}<span class="equipment-name">МАГНИТ <b id="magnet-level">I</b></span><span class="equipment-status">АКТИВЕН</span><i class="equipment-line gold-line"></i></div>
    </div>
    <div class="radar-wrap"><div class="radar-top"><span>СКАНЕР</span><span id="radar-range">120 М</span></div><canvas id="radar" width="320" height="320" aria-label="Радар астероидов и вражеских кораблей"></canvas><div class="radar-legend"><i></i>РУДА<span class="danger-dot"></span>ОПАСНОСТЬ</div></div>
    <footer class="flight-footer"><span id="controls-hint" class="controls-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> МАНЁВР<span class="hint-divider"></span><kbd>ЛКМ</kbd> ОГОНЬ<span class="hint-divider"></span><kbd>SHIFT</kbd> ФОРСАЖ</span><span id="flight-objective" class="objective">Пройдите пояс. Сохраните корабль.</span><span class="version-label">ЭКСПЕДИЦИЯ 01</span></footer>
    <div class="touch-controls"><div id="joystick" class="joystick" aria-label="Маневрирование"><div id="joystick-knob"></div></div><div class="touch-right"><div class="touch-maneuvers"><button id="touch-roll" aria-label="Бочка в сторону джойстика">${icon('rotate-ccw')}<span>БОЧКА</span></button><button id="touch-boost" aria-label="Форсаж на 6 секунд">${icon('flame')}</button></div><button id="touch-fire" aria-label="Стрелять">${icon('crosshair')}<span>ОГОНЬ</span></button></div></div>
  </div>
  <section id="intro" class="intro" hidden><div class="intro-panel"><h1>Кеплер:<br/><span>Дрейф</span></h1><p>На краю известного космоса<br/>богатство скрывается в камне.</p><div class="expedition-details"><span id="mode-details">${TOTAL_SECTORS} СЕКТОРОВ</span><i></i><span>ОДНА ПОПЫТКА</span></div><div class="run-modes" role="group" aria-label="Режим полёта"><button id="mode-expedition" class="run-mode selected" aria-pressed="true">Экспедиция<span>6 секторов · пираты и боссы</span></button><button id="mode-endless" class="run-mode" aria-pressed="false">Глубокий дрейф<span>Без конца · эвакуация с добычей</span></button><button id="mode-freeflight" class="run-mode" aria-pressed="false">Свободный полёт<span>Курс в 360° · кабина и вид сзади</span></button></div><button id="launch-button" class="primary-button">Начать экспедицию ${icon('arrow-up-right')}</button><button id="intro-help" class="text-button">${icon('keyboard')} Управление</button><div id="best-start" class="best-start"></div></div><div class="intro-caption"><span></span>ПОЯС КЕПЛЕРА<br/><small>Внешняя граница исследованного пространства</small></div></section>
  <div id="overlay" class="overlay" hidden></div>
</main>`;
icons();
}
