# Weapon HUD extension

This records the implemented equipment extension in Kepler Drift. It describes the current HUD rather than creating a new product or design-system authority. The incumbent Three.js scene, Exo 2 typeface, Lucide icons, and compact flight instruments remain the visual basis.

## Inherited conventions

- Dark translucent instrument surfaces sit over the game scene, with pale text, thin borders, and gently rounded equipment buttons (5px).
- Ore and purchase feedback use gold; shields use ice blue; hull status and the ship retain the orange and white vocabulary.
- Flight information stays at the edges: sector information at the upper left, ship status at the lower left, radar at the lower right, equipment centered below the ship.
- Button focus uses the incumbent ice-blue outline (2px with a 5px offset). Lucide icons retain a 1.5px stroke. HUD numbers use tabular figures where they change during flight.
- The existing scene remains the primary visual content. This HUD extension does not establish a replacement world or new camera behavior.

## Weapon choices

The equipment bank presents native buttons in the fixed order below. Each has a text name, icon, descriptive status, and colored bottom line. Color supplements those labels.

| Choice | Shortcut | Accent | Initial status |
| --- | --- | --- | --- |
| Импульсы | 1, including numpad | `#edb580` | ТОЧНЫЙ ОГОНЬ |
| Плазма | 2, including numpad | `#b6acff` | РАДИУС 7 М |
| Резак | 3, including numpad | `#8ae6f7` | ГОТОВ · 1,8 С |

Selection updates both the button's pressed state and its highlighted border/name. The pulse weapon is selected initially. Clicking a weapon during flight returns focus to the scene. The auto-fire control is a separate toggle with its own pressed state and action label.

The cutter reads `ЛУЧ … С` while firing and `ЗАРЯД … С` while recharging. Its line drains during the 1.8-second beam and fills during recharge; firing changes the button background, and recharging dims its icon. Status text uses 9px tabular figures; weapon names use 10px at the base desktop and coarse-pointer layouts. These measurements describe this instrument bank, not a general text-size recommendation.

## Responsive arrangement

On desktop, the weapon bank shares the bottom equipment row with boost and the passive magnet. Narrow layouts hide the passive magnet, then keep only the three weapon choices in that row.

On a coarse pointer in portrait, the bank remains available above the joystick and fire controls. Its width is `min(360px, calc(100% - 44px))`, its buttons are 62px tall, and the bottom offset is `153px + safe-area-inset-bottom`. Keyboard badges disappear, while names and status labels remain. Ship status and radar move above the bank. The wider coarse-pointer layout places a 300px bank at the bottom center between the flight controls.

## Danger state

A nearby explosive asteroid reveals a status warning explaining that firing triggers an explosion and instructing the pilot to move aside. Volatile targets have a warm dark label surface and red-orange health line; the radar uses the same danger color (`#ff765e`). The warning and target wording make the hazard identifiable beyond color alone.

## Implementation references

The source of truth is `src/style.css` for visual states and breakpoints, `src/ui/shell.ts` for the equipment buttons, `src/ui/hud.ts` for state updates, `src/main.ts` for click bindings, `src/game.ts` for keyboard bindings, and `src/weapons.ts` for names, ordering, and cutter duration. The six-stop route follows `TOTAL_SECTORS` from `src/state.ts`.

`PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` were absent from this public copy when documented. This ordinary extension leaves those inherited omissions unresolved.
