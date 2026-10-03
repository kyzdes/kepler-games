import type { Game } from '../game';
import { UPGRADES, WEAPON_UPGRADES, canBuyWeapon, upgradeCost, upgradeMaxed } from '../state';
import { WEAPON_ORDER, WEAPONS, MAX_ENERGY_LEVEL, weaponDamage, cutterRecharge, PLASMA_RADIUS, SCATTER_PELLETS, SCATTER_RANGE } from '../weapons';
import type { WeaponId } from '../weapons';
import { icon } from './dom';

const number = (value: number): string => Number(value.toFixed(1)).toLocaleString('ru-RU');

function weaponStats(game: Game, id: WeaponId): string {
  const power = number(weaponDamage(id, game.run.damage));
  if (id === 'pulse') return `2 × ${power} урона · точный огонь`;
  if (id === 'plasma') return `${power} урона · взрыв ${PLASMA_RADIUS} м`;
  if (id === 'scatter') return `${SCATTER_PELLETS} × ${power} урона · дальность ${SCATTER_RANGE} м`;
  if (id === 'seeker') return `2 × ${power} урона · самонаведение`;
  return `${power} урона/с · луч 1,8 с · заряд ${number(cutterRecharge(game.run.levels.laser))} с`;
}

/** The paused bay displays the same prices and power rules the combat uses. */
export function armoryMarkup(game: Game, feedback: string): string {
  const r = game.run;
  return `<section class="shop-panel armory-panel">
    <div class="shop-heading"><div><h1>Оружие корабля.</h1><p>Откройте новое оружие или усильте установленное.<br/>Полёт на паузе. Покупки действуют до конца забега.</p></div><div class="shop-balance">${icon('gem')}<strong id="armory-ore">${r.ore}</strong><span>ДОСТУПНО РУДЫ</span></div></div>
    <div class="armory-layout">
      <section class="weapon-catalog" aria-label="Арсенал корабля"><h2>Арсенал</h2><ol>${WEAPON_ORDER.map(id => {
        const w = WEAPONS[id], owned = r.unlockedWeapons[id], equipped = owned && game.weapons.selected === id;
        const affordable = canBuyWeapon(r, id);
        return `<li class="catalog-row ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''}" data-catalog-weapon="${id}">
          <div class="catalog-symbol" aria-hidden="true">${icon(w.icon)}</div>
          <div class="catalog-content"><h3><kbd>${w.key}</kbd>${w.name}${equipped ? '<span class="catalog-equipped">УСТАНОВЛЕНО</span>' : ''}</h3><p>${w.role}</p><div class="catalog-stats">${weaponStats(game, id)}</div></div>
          <div class="catalog-action">${owned ? `<button class="catalog-equip" data-equip-weapon="${id}" aria-pressed="${equipped}" ${equipped ? 'disabled' : ''} aria-label="${equipped ? `${w.name} · на борту` : `Оснастить: ${w.name}`}">${equipped ? icon('check') + 'На борту' : 'Оснастить'}</button>` : `<div class="catalog-price">${icon('gem')} ${w.cost}<span>РУДЫ</span></div><button class="catalog-unlock" data-unlock-weapon="${id}" ${affordable ? '' : 'disabled'} aria-label="Открыть ${w.name} за ${w.cost} руды">${affordable ? 'Открыть и оснастить' : `Ещё ${w.cost - r.ore} руды`}</button>`}</div>
        </li>`;
      }).join('')}</ol></section>
      <section class="armory-modules" aria-label="Усиление оружия"><h2>Модули</h2><div class="upgrade-grid armory-grid">${WEAPON_UPGRADES.map(id => {
        const u = UPGRADES[id], cost = upgradeCost(r, id), maxed = upgradeMaxed(r, id);
        const level = id === 'laser' ? maxed ? `МАКСИМУМ · УРОВЕНЬ ${MAX_ENERGY_LEVEL}` : `УРОВЕНЬ ${r.levels.laser} → ${r.levels.laser + 1}` : maxed ? 'УСТАНОВЛЕН' : 'ЗАЛП ×3';
        const detail = id === 'laser' ? `Урон всего арсенала +35%. Импульсы: ${number(r.damage)}${maxed ? '' : ` → ${number(r.damage * 1.35)}`}. Заряд резака: ${number(cutterRecharge(r.levels.laser))}${maxed ? '' : ` → ${number(cutterRecharge(r.levels.laser + 1))}`} с.` : u.description;
        return `<article class="upgrade-card ${u.color} ${maxed ? 'installed' : ''}"><h3>${icon(maxed ? 'check' : u.icon)}${u.name}</h3><div class="module-level">${level}</div><p>${detail}</p><div class="armory-price">${maxed ? 'Модуль активен' : `${icon('gem')} ${cost} руды`}</div><button class="upgrade-buy" data-weapon="${id}" ${maxed || r.ore < cost ? 'disabled' : ''} aria-label="${maxed ? `${u.name}: максимум` : `${id === 'laser' ? 'Улучшить энергоконтур' : 'Установить тройной залп'} за ${cost} руды`}">${maxed ? `${icon('check')} ${id === 'laser' ? 'Максимум' : 'Установлено'}` : r.ore < cost ? `Нужно ещё ${cost - r.ore} руды` : `${id === 'laser' ? 'Улучшить энергоконтур' : 'Установить'} ${icon('arrow-up-right')}`}</button></article>`;
      }).join('')}</div></section>
    </div>
    <p class="armory-feedback" role="status" aria-live="polite">${feedback}</p>
    <div class="shop-footer"><p>Импульсы — стартовое оружие.<br/><span>Переключение в полёте — клавиши 1–5. Арсенал — U.</span></p><button id="close-armory" class="primary-button">${game.armoryReturnsToUpgrade ? 'К мастерской' : game.armoryReturnsToPause ? 'К паузе' : 'К полёту'} ${icon('play')}</button></div>
  </section>`;
}
