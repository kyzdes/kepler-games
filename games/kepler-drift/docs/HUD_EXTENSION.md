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
| Плазма | 2, including numpad | `#b6acff` | 90 РУДЫ · U |
| Картечь | 3, including numpad | `#ffbd87` | 140 РУДЫ · U |
| Ракеты | 4, including numpad | `#a3e4ba` | 220 РУДЫ · U |
| Резак | 5, including numpad | `#8ae6f7` | 320 РУДЫ · U |

Selection updates both the button's pressed state and its highlighted border/name. Only impulses are owned and selected initially. Locked shortcuts open the bay without selecting or firing the weapon; purchase prices are fixed for the run. Owned plasma shows its 9 m blast, scattershot its eight pellets, missiles their target lock, and the cutter its charge. Clicking a weapon during flight returns focus to the scene. The auto-fire control is a separate toggle with its own pressed state and action label.

The cutter reads `ЛУЧ … С` while firing and `ЗАРЯД … С` while recharging. Its line drains during the 1.8-second beam and fills during recharge; firing changes the button background, and recharging dims its icon. Status text uses 9px tabular figures; weapon names use 10px at the base desktop and coarse-pointer layouts. These measurements describe this instrument bank, not a general text-size recommendation.

## Desktop arrangement and weapon bay

Five weapon choices, boost and the passive magnet share the bottom row. Seven compact 88px instruments with 8px gaps keep the flight corridor clear; the incumbent desktop breakpoint uses 76px instruments and hides the passive magnet where necessary.

U opens the protected bay from flight, pause or the sector workshop. The 1080px maximum-width panel keeps its heading, ore balance and return action fixed while the content can scroll. Five catalog rows sit beside two module cards. Each row shows a shortcut, name, role, current power and a fixed price or owned/equipped state. A purchase debits ore, equips the gun and announces feedback. Insufficient ore disables purchase and names the shortfall; energy level 5 is visibly maximum. The return button restores the original phase and preserves workshop offers and purchased modules.

This extension was checked at 1440×900 and 1280×800. Existing touch styles remain in source but were neither developed nor verified in this update, as requested by the user.

## Boss armor states

The boss HUD distinguishes closed armor, opening, exposed reactor and overload. Shutters take 0.65 seconds to open and share the damage clock; all opening damage is blocked. The 37% shared per-opening budget triggers overload closure. Target labels follow the actual boss state; the camera does not gain encounter shake.

## Danger state

A nearby explosive asteroid reveals a status warning explaining that firing triggers an explosion and instructing the pilot to move aside. Volatile targets have a warm dark label surface and red-orange health line; the radar uses the same danger color (`#ff765e`). The warning and target wording make the hazard identifiable beyond color alone.

## Implementation references

The source of truth is `src/style.css` for visual states and breakpoints, `src/ui/shell.ts` for the equipment buttons, `src/ui/hud.ts` for state updates, `src/main.ts` for click bindings, `src/game.ts` for keyboard bindings, and `src/weapons.ts` for the shared catalog, prices, power and ordering; `src/state.ts` for atomic run purchases and upgrade caps; `src/ui/armory.ts` for bay markup. The six-stop route follows `TOTAL_SECTORS` from `src/state.ts`.

`PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` were absent from this public copy when documented. This ordinary extension leaves those inherited omissions unresolved.

## Local finish evidence — 3 October 2026

Independent desktop finish disposition: `ship`, based on shop captures at 1440×900 and 1280×800, owned state and flight HUD. Native UI actions with staged ore debit 90/140/220/320 exactly, switch all five guns, preserve pause/workshop return and enforce the energy cap. The build and 115 unit tests pass; Comet probes pass 28 combat, 55 flight and 12 collision cases. The GPU probe reads 900 frames without brightness drops or GL errors. These are bounded integration receipts, not human balance or physical smartphone evidence; publication is verified separately. No new shipping raster or design authority was introduced.
