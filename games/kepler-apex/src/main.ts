import { createIcons, Orbit, Volume2, VolumeX, Maximize, Pause, HelpCircle, ArrowRight, RotateCcw, Play, X, Zap, ArrowLeft, ChevronRight, Flag, Trophy } from 'lucide';
import { Game } from './game';
import { TRACK_LENGTH, curve, curvatureAt } from './track';
import { LAPS, formatTime, standings, clamp } from './rules';

const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const icon=(name:string)=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const icons=()=>createIcons({icons:{Orbit,Volume2,VolumeX,Maximize,Pause,HelpCircle,ArrowRight,RotateCcw,Play,X,Zap,ArrowLeft,ChevronRight,Flag,Trophy},attrs:{'stroke-width':1.5}});
let bestLap=Infinity,bestRace=Infinity;
try {const saved=JSON.parse(localStorage.getItem('kepler-apex-records-v1')||'{}');if(typeof saved.lap==='number'&&saved.lap>0)bestLap=saved.lap;if(typeof saved.race==='number'&&saved.race>0)bestRace=saved.race;}catch{/* Records are optional. */}
let game:Game|undefined;
let toastTimer=0;
let newRecord=false;
let finishRecorded=false;

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

const dialog=$<HTMLDialogElement>('dialog');
function showDialog(content:string):void { $('dialog-content').innerHTML=content;icons();if(!dialog.open)dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus(); }
function dismiss():void {dialog.close();if(game?.race.phase==='paused')game.resume();}
function showHelp():void {
  game?.pause();showDialog(`<h2 id="dialog-title">Чувствуйте трассу.</h2><p>Обгоните пять соперников за три круга. Голубые полосы на асфальте ускоряют болид и пополняют заряд.</p><dl class="controls-list"><div><dt>Поворот</dt><dd><kbd>A</kbd><kbd>D</kbd> или <kbd>←</kbd><kbd>→</kbd></dd></div><div><dt>Тормоз</dt><dd><kbd>S</kbd> / <kbd>↓</kbd></dd></div><div><dt>Ручник / занос</dt><dd><kbd>ПРОБЕЛ</kbd> + поворот</dd></div><div><dt>Форсаж</dt><dd><kbd>SHIFT</kbd> удерживать</dd></div><div><dt>Газ вручную</dt><dd><kbd>W</kbd> / <kbd>↑</kbd></dd></div><div><dt>Автоматический газ</dt><dd><kbd>G</kbd> вкл / выкл</dd></div><div><dt>Пауза / звук</dt><dd><kbd>ESC</kbd> / <kbd>M</kbd></dd></div></dl><p class="help-note">Автогаз включён по умолчанию. Перед крутым поворотом сбросьте скорость. Для заноса зажмите пробел и поверните; отпустите ручник и контррулём выровняйте болид. Шины теряют сцепление при резком манёвре и на высокой скорости.</p><p class="touch-help">На телефоне используйте экранные кнопки. Удобнее играть в альбомной ориентации.</p><button id="dismiss" class="primary">Понятно ${icon('arrow-right')}</button>`);
  $('dismiss').onclick=dismiss;
}
function showPause():void {
  showDialog(`<h2 id="dialog-title">Пит-стоп.</h2><p>Гонка на паузе. Ваше время остановлено.</p><div class="pause-info"><span>КРУГ ${Math.min(LAPS,(game?.race.lapTimes.length||0)+1)} / 3</span><strong>${formatTime(game?.race.elapsed||0)}</strong></div><div class="dialog-actions"><button id="resume" class="primary">Продолжить ${icon('play')}</button><button id="restart" class="secondary">Заново ${icon('rotate-ccw')}</button></div><button id="to-menu" class="text-button">Вернуться в меню</button>`);
  $('resume').onclick=dismiss;$('restart').onclick=()=>{dialog.close();finishRecorded=false;game?.start();};$('to-menu').onclick=()=>{dialog.close();game?.menu();};
}
function saveRecords():void {
  if(!game||finishRecorded)return;finishRecorded=true;
  newRecord=game.race.elapsed<bestRace;bestRace=Math.min(bestRace,game.race.elapsed);bestLap=Math.min(bestLap,...game.race.lapTimes);
  try{localStorage.setItem('kepler-apex-records-v1',JSON.stringify({lap:bestLap,race:bestRace}));}catch{/* Private mode still permits racing. */}
  $('menu-best').textContent=formatTime(bestRace);
}
function showFinish():void {
  if(!game)return;saveRecords();const ranking=standings(game.race),place=ranking.findIndex(d=>d.id===0)+1;
  const rows=ranking.map((d,i)=>`<li class="${d.id===0?'you':''}"><span>${i+1}</span><b>${d.name}</b><strong>${d.finishTime!==null?formatTime(d.finishTime):`ещё ${Math.max(1,Math.ceil((LAPS*TRACK_LENGTH-d.distance)/10)*10)} м`}</strong></li>`).join('');
  showDialog(`<h2 id="dialog-title">${place===1?'Ваша орбита.':'Финиш.'}</h2><p>${place===1?'Первое место. Остальные догоняют.':`Вы заняли ${place}-е место из шести.`} ${newRecord?'Новый личный рекорд.':''}</p><div class="finish-time"><strong>${formatTime(game.race.elapsed)}</strong><span>ВРЕМЯ ЗАЕЗДА</span></div><ol class="results">${rows}</ol><div class="lap-results">${game.race.lapTimes.map((t,i)=>`<span>КРУГ ${i+1}<b>${formatTime(t)}</b></span>`).join('')}</div><div class="dialog-actions"><button id="again" class="primary">Ещё заезд ${icon('rotate-ccw')}</button><button id="finish-menu" class="secondary">В меню</button></div>`);
  $('again').onclick=()=>{dialog.close();finishRecorded=false;game?.start();};$('finish-menu').onclick=()=>{dialog.close();game?.menu();};
}
function onPhase(g:Game):void {
  $('race-app').dataset.phase=g.race.phase;$('hud').hidden=g.race.phase==='menu';$('intro').hidden=g.race.phase!=='menu';
  if(g.race.phase==='paused')showPause();if(g.race.phase==='finished')showFinish();
  if(g.race.phase==='countdown'||g.race.phase==='racing')g.renderer.domElement.focus({preventScroll:true});
  update(g);
}
function toast(text:string):void {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=window.setTimeout(()=>$('toast').classList.remove('visible'),2100);}

const map=$<HTMLCanvasElement>('minimap'),ctx=map.getContext('2d')!;
const mapPoints=curve.getSpacedPoints(150),minX=Math.min(...mapPoints.map(p=>p.x)),maxX=Math.max(...mapPoints.map(p=>p.x)),minZ=Math.min(...mapPoints.map(p=>p.z)),maxZ=Math.max(...mapPoints.map(p=>p.z));
const mapScale=Math.min(346/(maxX-minX),236/(maxZ-minZ));
function mapXY(x:number,z:number):[number,number]{return [210+(x-(minX+maxX)/2)*mapScale,145+(z-(minZ+maxZ)/2)*mapScale];}
function drawMap(g:Game):void {
  ctx.clearRect(0,0,420,290);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();mapPoints.forEach((p,i)=>{const [x,y]=mapXY(p.x,p.z);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.strokeStyle='#1b3446';ctx.lineWidth=10;ctx.stroke();ctx.strokeStyle='#6c8c9e';ctx.lineWidth=1.5;ctx.stroke();
  g.race.drivers.slice().reverse().forEach(d=>{const t=((d.distance%TRACK_LENGTH)+TRACK_LENGTH)%TRACK_LENGTH/TRACK_LENGTH,p=curve.getPointAt(t),[x,y]=mapXY(p.x,p.z);ctx.beginPath();ctx.arc(x,y,d.id===0?6:3.8,0,Math.PI*2);ctx.fillStyle=d.color;ctx.fill();if(d.id===0){ctx.strokeStyle='#07131e';ctx.lineWidth=2;ctx.stroke();}});
}
function update(g:Game):void {
  const r=g.race,p=r.drivers[0],ranking=standings(r),lap=Math.min(LAPS,r.lapTimes.length+1);
  $('position').textContent=String(ranking.findIndex(d=>d.id===0)+1);
  $('standings').innerHTML=ranking.map((d,i)=>`<li class="${d.id===0?'you':''}"><span>${i+1}</span><i style="background:${d.color}"></i><b>${d.name}</b><small>${d.id===0?'APX–01':(Math.abs(d.distance-p.distance)<2?'РЯДОМ':(d.distance>p.distance?'−':'+')+Math.abs((d.distance-p.distance)/Math.max(30,p.speed)).toFixed(1))}</small></li>`).join('');
  $('lap').textContent=String(lap).padStart(2,'0');$('lap-progress').style.transform=`scaleX(${clamp(p.distance/(TRACK_LENGTH*LAPS),0,1)})`;
  $('race-time').textContent=formatTime(r.elapsed);$('lap-time').textContent=formatTime(r.phase==='finished'?r.lapTimes[2]:r.elapsed-r.lapStarted);
  $('best-lap').textContent=formatTime(Math.min(bestLap,...r.lapTimes));
  $('speed').textContent=String(Math.round(p.speed*3.6)).padStart(3,'0');$('speed-fill').style.transform=`scaleX(${p.speed/146})`;
  $('energy').textContent=`${Math.round(r.energy)}%`;$('energy-fill').style.transform=`scaleX(${r.energy/100})`;
  $('boost').classList.toggle('active',r.boosting||r.padBoost>0);$('boost-state').textContent=r.padBoost>0?'РАЗГОННАЯ ПОЛОСА':r.boosting?'ФОРСАЖ АКТИВЕН':r.boostLocked?'ПЕРЕЗАРЯДКА ДО 25%':r.energy>99?'ФОРСАЖ ГОТОВ':'ЗАРЯД ВОССТАНАВЛИВАЕТСЯ';
  $('impact').style.opacity=String(r.impact*.28);
  const counting=r.phase==='countdown';$('countdown').hidden=!counting;$('countdown').textContent=counting?String(Math.max(1,Math.ceil(r.countdown))):'';
  const segment=Math.floor(g.progress*4);$('sector').textContent=['СТАРТОВАЯ ПРЯМАЯ','ЛЕДЯНАЯ ДУГА','ДАЛЬНИЙ ВИРАЖ','ВОЗВРАЩЕНИЕ'][segment];
  const bend=curvatureAt(p.distance+70);$('turn-hint').hidden=!(Math.abs(bend)>.007&&p.speed>55&&r.phase==='racing');
  $('turn-arrow').style.transform=bend<0?'none':'scaleX(-1)';$('turn-copy').textContent=Math.abs(bend)>.014?'КРУТОЙ ПОВОРОТ':'ПОВОРОТ ВПЕРЕДИ';
  drawMap(g);
}

function bindHold(id:string,key:keyof Game['touch']):void {
  const el=$(id);const pointers=new Set<number>();
  el.addEventListener('pointerdown',e=>{if(!game||game.race.phase!=='racing')return;e.preventDefault();pointers.add(e.pointerId);el.setPointerCapture(e.pointerId);game.touch[key]=true;el.classList.add('held');});
  const release=(e:PointerEvent)=>{pointers.delete(e.pointerId);if(game)game.touch[key]=pointers.size>0;el.classList.toggle('held',pointers.size>0);};
  el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
  el.addEventListener('keydown',e=>{if(game&&game.race.phase==='racing'&&(e.code==='Enter'||e.code==='Space')){e.preventDefault();game.touch[key]=true;}});
  el.addEventListener('keyup',e=>{if(game&&(e.code==='Enter'||e.code==='Space'))game.touch[key]=false;});
  el.addEventListener('blur',()=>{pointers.clear();if(game)game.touch[key]=false;el.classList.remove('held');});
}
bindHold('boost','boost');bindHold('touch-boost','boost');bindHold('touch-left','left');bindHold('touch-right','right');bindHold('touch-brake','brake');
function toggleAuto():void {if(!game)return;game.autoThrottle=!game.autoThrottle;$('auto').setAttribute('aria-pressed',String(game.autoThrottle));$('auto').innerHTML=`АВТОГАЗ <b>${game.autoThrottle?'ВКЛ':'ВЫКЛ'}</b>`;toast(game.autoThrottle?'Автогаз включён':'Удерживайте W или ↑ для разгона');}
function toggleSound():void {if(!game)return;const muted=game.audio.toggle();$('sound').setAttribute('aria-label',muted?'Включить звук':'Выключить звук');$('sound').innerHTML=icon(muted?'volume-x':'volume-2');icons();}
async function fullscreen():Promise<void> {try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Полный экран недоступен в этом браузере');}}
$('auto').onclick=toggleAuto;$('sound').onclick=toggleSound;$('fullscreen').onclick=()=>void fullscreen();$('help').onclick=showHelp;$('pause').onclick=()=>game?.pause();
$('start').onclick=()=>{finishRecorded=false;game?.start();};$('reload').onclick=()=>location.reload();
dialog.addEventListener('cancel',e=>{e.preventDefault();if(game?.race.phase==='finished'){dialog.close();game.menu();}else dismiss();});
addEventListener('keydown',e=>{
  if(e.repeat)return;
  if((e.code==='Escape'||e.code==='KeyP')&&!dialog.open){e.preventDefault();game?.pause();}
  if(e.code==='KeyM')toggleSound();if(e.code==='KeyF')void fullscreen();if(e.code==='KeyH'&&!dialog.open)showHelp();if(e.code==='KeyG'&&!dialog.open)toggleAuto();
});
function error(message:string):void {$('loader').hidden=false;$('loader').classList.add('failed');$('loading-status').textContent=message;$('reload').hidden=false;$('reload').focus();}
async function boot():Promise<void> {
  try {
    game=new Game($('scene'),{update,phase:onPhase,toast,error});
    await game.load((label,value)=>{$('loading-status').textContent=label;$('loading-fill').style.transform=`scaleX(${value/100})`;document.querySelector('.loading-track')?.setAttribute('aria-valuenow',String(value));});
    $('loader').hidden=true;$<HTMLButtonElement>('start').disabled=false;
  }catch(err){console.error(err);error('Не удалось запустить 3D. Нужен браузер с WebGL 2 и аппаратным ускорением. Попробуйте перезагрузить игру.');}
}
void boot();
