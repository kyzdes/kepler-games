import { $, icon, icons } from './ui/dom';
import { mountApp } from './ui/shell';
import { createRaceHud } from './ui/hud';
import { Game } from './game';
import { TRACK_LENGTH } from './track';
import { LAPS, formatTime, standings } from './rules';

let bestLap=Infinity,bestRace=Infinity;
try {const saved=JSON.parse(localStorage.getItem('kepler-apex-records-v1')||'{}');if(typeof saved.lap==='number'&&saved.lap>0)bestLap=saved.lap;if(typeof saved.race==='number'&&saved.race>0)bestRace=saved.race;}catch{/* Records are optional. */}
let game:Game|undefined;
let toastTimer=0;
let newRecord=false;
let finishRecorded=false;

mountApp(bestRace, bestLap);

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

const update = createRaceHud(() => bestLap);

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
