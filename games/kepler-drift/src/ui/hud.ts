import type { Game } from '../game';
import { BOOST_DURATION } from '../boost';
import { SECTOR_SECONDS, WEAPON_UPGRADES, upgradeCost } from '../state';
import { $, time, setText } from './dom';
import { CUTTER_DURATION, cutterRecharge } from '../weapons';

export function createFlightHud(toast: (message: string) => void) {
  let lastOre = 0;
  let gainTimer: ReturnType<typeof setTimeout>;
  let weaponHintShown = false;
  const radarContext = ($('radar') as HTMLCanvasElement).getContext('2d')!;
  function update(g: Game): void {
    const r = g.run;
    setText('ore-value', r.ore.toLocaleString('ru-RU'));
    if (r.ore > lastOre && r.phase === 'flying') {
      $('ore-gain').textContent = `+${r.ore - lastOre}`;
      $('ore-gain').classList.add('show');
      clearTimeout(gainTimer);
      gainTimer = setTimeout(() => $('ore-gain').classList.remove('show'), 1000);
    }
    lastOre = r.ore;
    setText('flight-time', time(r.elapsed));
    setText('shield-value', String(Math.ceil(r.shield)));
    setText('shield-max', ` / ${r.maxShield}`);
    setText('hull-value', String(Math.ceil(r.hull)));
    $('shield-fill').style.transform = `scaleX(${r.shield / r.maxShield})`;
    $('hull-fill').style.transform = `scaleX(${r.hull / 100})`;
    $('hull-fill').classList.toggle('critical', r.hull < 30);
    $('sector-progress').style.transform = `scaleX(${r.sectorTime / SECTOR_SECONDS})`;
    $('boost-fill').style.transform = `scaleX(${g.boostTime > 0 ? g.boostTime / BOOST_DURATION : 1 - g.boostCooldown / r.boostCooldown})`;
    setText('flight-speed', String(Math.round(g.forwardSpeed)));
    setText('roll-status', g.roll.active ? 'ВРАЩЕНИЕ' : g.roll.cooldown > 0 ? `${g.roll.cooldown.toFixed(1)} С` : 'ГОТОВА');
    $('roll-status').classList.toggle('recharging', g.roll.cooldown > 0);
    ($('touch-roll') as HTMLButtonElement).disabled = g.roll.cooldown > 0;
    setText('boost-status', g.boostTime > 0 ? `ФОРСАЖ ${g.boostTime.toFixed(1)} С` : g.boostCooldown > 0 ? `ЗАРЯД ${g.boostCooldown.toFixed(1)} С` : 'ГОТОВ · 6 С');
    $('boost-button').classList.toggle('boosting', g.boostTime > 0);
    for (const id of ['boost-button', 'touch-boost'])
      ($(id) as HTMLButtonElement).disabled = g.boostTime > 0 || g.boostCooldown > 0;
    const affordable = WEAPON_UPGRADES.some(id => !(id === 'multishot' && r.multishot) && r.ore >= upgradeCost(r, id));
    $('armory-button').classList.toggle('affordable', affordable);
    if (!weaponHintShown && affordable && r.phase === 'flying') {
      weaponHintShown = true;
      toast('Руды хватит на улучшение. Откройте «Оружие» · U.');
    }
    $('boost-button').classList.toggle('cooldown', g.boostCooldown > 0);
    $('weapon-button').classList.toggle('active', g.autoFire);
    $('weapon-button').setAttribute('aria-pressed', String(g.autoFire));
    $('weapon-button').setAttribute('aria-label', g.autoFire ? 'Выключить автоогонь' : 'Включить автоогонь');
    setText('fire-status', g.autoFire ? 'АВТО' : 'РУЧНОЙ');
    document.querySelectorAll<HTMLButtonElement>('[data-weapon-id]').forEach(button => {
      const selected = button.dataset.weaponId === g.weapons.selected;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('reticle').dataset.weapon = g.weapons.selected;
    setText('cutter-status', g.weapons.cutting ? `ЛУЧ ${g.weapons.remaining.toFixed(1)} С` : g.weapons.cooldown > 0 ? `ЗАРЯД ${g.weapons.cooldown.toFixed(1)} С` : 'ГОТОВ · 1,8 С');
    $('select-cutter').classList.toggle('firing', g.weapons.cutting);
    $('select-cutter').classList.toggle('recharging', g.weapons.cooldown > 0);
    $('cutter-fill').style.transform = `scaleX(${g.weapons.cutting ? g.weapons.remaining / CUTTER_DURATION : Math.max(0, 1 - g.weapons.cooldown / cutterRecharge(r.levels.laser))})`;
    $('hazard-warning').hidden = !g.dangerNearby;
    const numerals = ['0', 'I', 'II', 'III', 'IV', 'V'];
    for (const id of ['laser', 'engine', 'magnet'] as const)
      setText(`${id}-level`, numerals[r.levels[id]] || String(r.levels[id]));
    $('damage-flash').style.opacity = String(g.damageFlash * .48);
    $('reticle').style.left = `${(g.pointer.x + 1) * 50}%`;
    $('reticle').style.top = `${(1 - g.pointer.y) * 50}%`;
    $('reticle').classList.toggle('locked', !!g.target);
    const target = g.targetScreen();
    $('target-info').hidden = !target;
    if (target) {
      $('target-info').style.left = `${target.x}px`;
      $('target-info').style.top = `${target.y}px`;
      $('target-health').style.transform = `scaleX(${Math.max(0, target.health)})`;
      $('target-info').dataset.kind = target.kind;
      setText('target-label', target.kind === 'volatile' ? 'ВЗРЫВНОЙ · ДЕРЖИТЕ ДИСТАНЦИЮ' : target.kind === 'armored' ? 'БРОНЕКАМЕНЬ · РЕЗАК' : target.ore ? 'РУДНЫЙ АСТЕРОИД' : 'СИЛИКАТНЫЙ АСТЕРОИД');
    }
    drawRadar(g);
  }
  function drawRadar(g: Game): void {
    const ctx = radarContext;
    ctx.clearRect(0, 0, 320, 320);
    ctx.save();
    ctx.translate(160, 160);
    ctx.fillStyle = 'rgba(5,16,26,.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(157,198,223,.23)';
    for (const r of [48, 94, 140]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-148, 0);
    ctx.lineTo(148, 0);
    ctx.moveTo(0, -148);
    ctx.lineTo(0, 148);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(157,198,223,.4)';
    ctx.setLineDash([2, 15]);
    ctx.beginPath();
    ctx.arc(0, 0, 147, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const rock of g.rocks) {
      if (rock.wait > 0 || rock.root.position.z < -120 || rock.root.position.z > 12)
        continue;
      const x = (rock.root.position.x - g.ship.root.position.x) * 3.5, y = rock.root.position.z * 1.02 + 50;
      if (Math.hypot(x, y) > 132)
        continue;
      ctx.fillStyle = rock.kind === 'volatile' ? '#ff765e' : rock.kind === 'armored' ? '#91bfff' : rock.ore ? '#eab66e' : '#738995';
      ctx.globalAlpha = .45 + (1 + rock.root.position.z / 120) * .5;
      ctx.beginPath();
      ctx.arc(x, y, rock.radius > 3 ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (rock.kind === 'volatile') {
        ctx.strokeStyle = '#ff765e'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d2efff';
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.lineTo(-7, 59);
    ctx.lineTo(0, 54);
    ctx.lineTo(7, 59);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return { update, resetWeaponHint: () => { weaponHintShown = false; } };
}
