export interface SectorVisual {
  planet: string; sky: string | null; planetTint: number; atmosphere: number;
  ring: number; sun: number; rim: number; fill: number; fog: number;
  skyRotation: [number, number, number]; bump: number; emission: number;
  planetRotation?: number;
}

export const SECTOR_VISUALS: readonly SectorVisual[] = [
  { planet: '/textures/kepler-ice.webp', sky: null,
    planetTint: 0x9cdeff, atmosphere: 0x46beff, ring: 0xa4dafa,
    sun: 0xcfeeff, rim: 0x73cfff, fill: 0xffc291, fog: 0x030b17,
    skyRotation: [0, 0, 0], bump: .65, emission: 0 },
  { planet: '/textures/planet-rift.webp', sky: '/textures/sky-rift.webp',
    planetTint: 0xffffff, atmosphere: 0xc176ff, ring: 0xd7a0ed,
    sun: 0xefddff, rim: 0x729cff, fill: 0xee85c7, fog: 0x0c061b,
    skyRotation: [0, 0, -.04], bump: .18, emission: .06 },
  { planet: '/textures/planet-core.webp', sky: '/textures/sky-core.webp',
    planetTint: 0xfff0dc, atmosphere: 0xff973e, ring: 0xedb175,
    sun: 0xffe0ba, rim: 0x61ceef, fill: 0xfa7538, fog: 0x140a12,
    skyRotation: [0, 0, -.02], bump: .85, emission: .38 },
  { planet: '/textures/kepler-ice.webp', sky: '/textures/sky-rift.webp',
    planetTint: 0x8bffd2, atmosphere: 0x38e7b3, ring: 0x87dfbb,
    sun: 0xc7ffed, rim: 0x48dbd9, fill: 0x5aad87, fog: 0x031610,
    skyRotation: [.08, .6, .12], bump: .8, emission: .08, planetRotation: 2.8 },
  { planet: '/textures/planet-rift.webp', sky: '/textures/sky-rift.webp',
    planetTint: 0x94bcff, atmosphere: 0x4479ff, ring: 0x89b3ff,
    sun: 0xc8dcff, rim: 0x4897ff, fill: 0xb16aef, fog: 0x030b24,
    skyRotation: [-.07, -.7, -.15], bump: .32, emission: .12, planetRotation: -.9 },
  { planet: '/textures/planet-core.webp', sky: '/textures/sky-core.webp',
    planetTint: 0xffb5a3, atmosphere: 0xff5d43, ring: 0xffa765,
    sun: 0xffbd9c, rim: 0xe263aa, fill: 0xff5633, fog: 0x1d070d,
    skyRotation: [.08, 1.2, .10], bump: 1, emission: .48, planetRotation: 3.4 },
];

export const SECTOR_TEXTURE_URLS = [...new Set(SECTOR_VISUALS.flatMap(visual => [visual.planet, visual.sky]).filter((url): url is string => url!==null))];
export function sectorVisual(sector: number): SectorVisual {
  return SECTOR_VISUALS[Math.max(0, Math.min(SECTOR_VISUALS.length - 1, Math.floor(sector) - 1))];
}
