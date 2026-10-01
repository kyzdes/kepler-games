import { $, icon, icons } from './dom';
import { TRACK_LENGTH } from '../track';
import { LAPS, formatTime } from '../rules';

export function mountApp(bestRace: number, bestLap: number): void {
$('app').innerHTML=`
<main id="race-app" class="race-app" data-phase="menu">
  <div id="scene" class="scene"></div>
  <div class="vignette" aria-hidden="true"></div><div id="impact" class="impact" aria-hidden="true"></div>
  <div class="frame frame-tl" aria-hidden="true"></div><div class="frame frame-tr" aria-hidden="true"></div><div class="frame frame-bl" aria-hidden="true"></div><div class="frame frame-br" aria-hidden="true"></div>
  <header class="header">
    <div class="identity">${icon('orbit')}<div><b>КЕПЛЕР<span> : </span>АПЕКС</b><small>ОРБИТАЛЬНЫЕ ГОНКИ</small></div></div>
    <div class="circuit-header">КОЛЬЦО КЕПЛЕРА<span>62° N &nbsp; / &nbsp; ВНЕШНЯЯ ОРБИТА</span></div>
    <div class="utilities"><button id="sound" class="icon-button" aria-label="Выключить звук" title="Звук · M">${icon('volume-2')}</button><button id="help" class="icon-button" aria-label="Управление" title="Управление · H">${icon('help-circle')}</button><button id="fullscreen" class="icon-button full-button" aria-label="На весь экран" title="На весь экран · F">${icon('maximize')}</button><button id="pause" class="icon-button play-only" aria-label="Пауза" title="Пауза · Esc">${icon('pause')}</button></div>
  </header>
  <section id="intro" class="intro" aria-labelledby="intro-title">
    <h1 id="intro-title">На грани<br><strong>притяжения.</strong></h1>
    <p>Ледяная планета внизу. Соперники впереди.<br>Три круга, чтобы оставить их позади.</p>
    <div class="race-spec"><span><b>03</b> круга</span><span><b>06</b> пилотов</span><span><b>${(TRACK_LENGTH*LAPS/1000).toFixed(1)}</b> км</span></div>
    <button id="start" class="primary" disabled>На старт ${icon('arrow-right')}</button>
    <p class="intro-controls desktop-hint"><kbd>A</kbd><kbd>D</kbd> поворот <span>·</span> <kbd>SHIFT</kbd> ускорение</p>
    <p class="intro-controls touch-hint">Повороты и ускорение — кнопками на экране</p>
    <div class="personal-best">ЛУЧШИЙ ЗАЕЗД <span id="menu-best">${formatTime(bestRace)}</span></div>
  </section>
  <div class="menu-caption"><span>APX–01</span><b>Электрический прототип</b><small>МАГНИТНОЕ СЦЕПЛЕНИЕ · ДВОЙНОЙ ФОРСАЖ</small></div>
  <div id="hud" class="hud" hidden>
    <section class="position-panel" aria-label="Позиции гонщиков"><div class="position-title"><strong id="position">6</strong><span>/ 6<small>ПОЗИЦИЯ</small></span></div><ol id="standings" class="standings"></ol></section>
    <section class="lap-panel" aria-label="Прогресс гонки"><div><span>КРУГ</span><strong id="lap">01</strong><span>/ 03</span></div><div class="lap-track"><i id="lap-progress"></i></div><p id="sector">СТАРТОВАЯ ПРЯМАЯ</p></section>
    <section class="timing-panel" aria-label="Время заезда"><span class="label">ВРЕМЯ ЗАЕЗДА</span><strong id="race-time">00:00.00</strong><div><span>КРУГ</span><b id="lap-time">00:00.00</b></div><div><span>ЛУЧШИЙ</span><b id="best-lap">${formatTime(bestLap)}</b></div></section>
    <div id="turn-hint" class="turn-hint" hidden><span id="turn-arrow">${icon('chevron-right')}</span><span id="turn-copy">ПОВОРОТ</span></div>
    <section class="map-panel" aria-label="Схема трассы"><div class="map-label"><span>КОЛЬЦО КЕПЛЕРА</span><span>${(TRACK_LENGTH/1000).toFixed(2)} КМ</span></div><canvas id="minimap" width="420" height="290" role="img" aria-label="Схема трассы и позиции шести гонщиков"></canvas><div class="map-legend"><i></i> ВЫ <span>APX–01</span></div></section>
    <section class="speed-panel" aria-label="Скорость и ускорение"><div class="speed-readout"><strong id="speed">000</strong><span>КМ/Ч</span></div><div class="speed-ticks" aria-hidden="true"><i id="speed-fill"></i></div><button id="boost" class="boost-control" aria-label="Ускорение, удерживайте кнопку"><span>${icon('zap')} ФОРСАЖ <kbd>SHIFT</kbd></span><b id="energy">100%</b><i class="boost-track"><i id="energy-fill"></i></i></button><div class="drive-state"><span id="boost-state">ЗАРЯД ВОССТАНАВЛИВАЕТСЯ</span><button id="auto" aria-pressed="true" title="Переключить автоматический газ · G">АВТОГАЗ <b>ВКЛ</b></button></div></section>
    <div class="touch-controls" aria-label="Сенсорное управление"><div><button id="touch-left" aria-label="Повернуть налево">${icon('arrow-left')}</button><button id="touch-right" aria-label="Повернуть направо">${icon('arrow-right')}</button></div><div><button id="touch-brake" class="touch-brake" aria-label="Тормоз">ТОРМОЗ</button><button id="touch-boost" class="touch-boost" aria-label="Форсаж">${icon('zap')}</button></div></div>
    <div id="countdown" class="countdown" aria-live="polite" hidden></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </div>
  <footer class="footer"><span class="desktop-hint"><kbd>A</kbd><kbd>D</kbd> ПОВОРОТ <kbd>S</kbd> ТОРМОЗ <kbd>ПРОБЕЛ</kbd> ЗАНОС <kbd>SHIFT</kbd> ФОРСАЖ</span><span class="footer-note">ДЕРЖИТЕ ТЕМП. НАЙДИТЕ СВОЙ АПЕКС.</span><span class="footer-end">KEPLER RACING DIVISION</span></footer>
</main>
<dialog id="dialog" aria-labelledby="dialog-title"><div id="dialog-content" class="dialog-content"></div></dialog>`;
icons();
}
