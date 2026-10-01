import type { Game } from '../game';
import { TRACK_LENGTH, curve, curvatureAt } from '../track';
import { LAPS, formatTime, standings, clamp } from '../rules';
import { $ } from './dom';

export function createRaceHud(getBestLap: () => number) {
  const map = $<HTMLCanvasElement>('minimap'), ctx = map.getContext('2d')!;
  const mapPoints = curve.getSpacedPoints(150), minX = Math.min(...mapPoints.map(p => p.x)), maxX = Math.max(...mapPoints.map(p => p.x)), minZ = Math.min(...mapPoints.map(p => p.z)), maxZ = Math.max(...mapPoints.map(p => p.z));
  const mapScale = Math.min(346 / (maxX - minX), 236 / (maxZ - minZ));
  function mapXY(x: number, z: number): [number, number] {
    return [210 + (x - (minX + maxX) / 2) * mapScale, 145 + (z - (minZ + maxZ) / 2) * mapScale];
  }
  function drawMap(g: Game): void {
    ctx.clearRect(0, 0, 420, 290);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    mapPoints.forEach((p, i) => {
      const [x, y] = mapXY(p.x, p.z);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#1b3446';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = '#6c8c9e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    g.race.drivers.slice().reverse().forEach(d => {
      const t = ((d.distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH / TRACK_LENGTH;
      const p = curve.getPointAt(t), [x, y] = mapXY(p.x, p.z);
      ctx.beginPath();
      ctx.arc(x, y, d.id === 0 ? 6 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      if (d.id === 0) {
        ctx.strokeStyle = '#07131e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }
  function update(g: Game): void {
    const r = g.race, p = r.drivers[0], ranking = standings(r), lap = Math.min(LAPS, r.lapTimes.length + 1);
    $('position').textContent = String(ranking.findIndex(d => d.id === 0) + 1);
    $('standings').innerHTML = ranking.map((d, i) => `<li class="${d.id === 0 ? 'you' : ''}"><span>${i + 1}</span><i style="background:${d.color}"></i><b>${d.name}</b><small>${d.id === 0 ? 'APX–01' : (Math.abs(d.distance - p.distance) < 2 ? 'РЯДОМ' : (d.distance > p.distance ? '−' : '+') + Math.abs((d.distance - p.distance) / Math.max(30, p.speed)).toFixed(1))}</small></li>`).join('');
    $('lap').textContent = String(lap).padStart(2, '0');
    $('lap-progress').style.transform = `scaleX(${clamp(p.distance / (TRACK_LENGTH * LAPS), 0, 1)})`;
    $('race-time').textContent = formatTime(r.elapsed);
    $('lap-time').textContent = formatTime(r.phase === 'finished' ? r.lapTimes[2] : r.elapsed - r.lapStarted);
    $('best-lap').textContent = formatTime(Math.min(getBestLap(), ...r.lapTimes));
    $('speed').textContent = String(Math.round(p.speed * 3.6)).padStart(3, '0');
    $('speed-fill').style.transform = `scaleX(${p.speed / 146})`;
    $('energy').textContent = `${Math.round(r.energy)}%`;
    $('energy-fill').style.transform = `scaleX(${r.energy / 100})`;
    $('boost').classList.toggle('active', r.boosting || r.padBoost > 0);
    $('boost-state').textContent = r.padBoost > 0 ? 'РАЗГОННАЯ ПОЛОСА' : r.boosting ? 'ФОРСАЖ АКТИВЕН' : r.boostLocked ? 'ПЕРЕЗАРЯДКА ДО 25%' : r.energy > 99 ? 'ФОРСАЖ ГОТОВ' : 'ЗАРЯД ВОССТАНАВЛИВАЕТСЯ';
    $('impact').style.opacity = String(r.impact * .28);
    const counting = r.phase === 'countdown';
    $('countdown').hidden = !counting;
    $('countdown').textContent = counting ? String(Math.max(1, Math.ceil(r.countdown))) : '';
    const segment = Math.floor(g.progress * 4);
    $('sector').textContent = ['СТАРТОВАЯ ПРЯМАЯ', 'ЛЕДЯНАЯ ДУГА', 'ДАЛЬНИЙ ВИРАЖ', 'ВОЗВРАЩЕНИЕ'][segment];
    const bend = curvatureAt(p.distance + 70);
    $('turn-hint').hidden = !(Math.abs(bend) > .007 && p.speed > 55 && r.phase === 'racing');
    $('turn-arrow').style.transform = bend < 0 ? 'none' : 'scaleX(-1)';
    $('turn-copy').textContent = Math.abs(bend) > .014 ? 'КРУТОЙ ПОВОРОТ' : 'ПОВОРОТ ВПЕРЕДИ';
    drawMap(g);
  }
  return update;
}
