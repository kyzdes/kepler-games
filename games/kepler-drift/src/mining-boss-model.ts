import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface MiningBossModel {
  root: T.Group;
  reactor: T.Object3D;
  drills: T.Group[];
  turrets: T.Object3D[];
  reactorGlow: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  shutters: T.Group[];
}

const graphite = new T.MeshStandardMaterial({ color: 0x29313a, metalness: .72, roughness: .47, flatShading: true });
const inset = new T.MeshStandardMaterial({ color: 0x101a23, metalness: .64, roughness: .59, flatShading: true });
const steel = new T.MeshStandardMaterial({ color: 0x74818b, metalness: .82, roughness: .34, flatShading: true });
const ochre = new T.MeshStandardMaterial({ color: 0xa47c3d, metalness: .57, roughness: .51, flatShading: true });
const pale = new T.MeshStandardMaterial({ color: 0xb5b4a6, metalness: .45, roughness: .6 });
const amber = new T.MeshStandardMaterial({ color: 0xffc06d, emissive: 0xe68726, emissiveIntensity: .95, roughness: .4 });
const cyan = new T.MeshStandardMaterial({ color: 0x69c6dc, emissive: 0x258dbb, emissiveIntensity: .7, metalness: .3, roughness: .32 });
const red = new T.MeshStandardMaterial({ color: 0xbd644c, emissive: 0xa22619, emissiveIntensity: .6, roughness: .43 });

const boxShape = new T.Shape();
boxShape.moveTo(-.46, -.46); boxShape.lineTo(.46, -.46); boxShape.lineTo(.46, .46); boxShape.lineTo(-.46, .46); boxShape.closePath();
const block = new T.ExtrudeGeometry(boxShape, { depth: .92, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 1, steps: 1 });
block.translate(0, 0, -.46);
const cylinder = new T.CylinderGeometry(1, 1, 1, 20);
const geometryCache = new Map<string, T.BufferGeometry>();
type Vec3 = [number, number, number];
type Template = Array<{ geometry: T.BufferGeometry; material: T.Material }>;
const templateCache = new Map<string, Template>();

function ringGeometry(radius: number, thickness: number, segments = 32): T.BufferGeometry {
  const key = `${radius}:${thickness}:${segments}`;
  let geometry = geometryCache.get(key);
  if (!geometry) { geometry = new T.TorusGeometry(radius, thickness, 6, segments); geometryCache.set(key, geometry); }
  return geometry;
}

class Parts {
  private readonly parts = new Map<T.Material, T.BufferGeometry[]>();
  private readonly transform = new T.Object3D();
  add(geometry: T.BufferGeometry, material: T.Material, position: Vec3 = [0, 0, 0], size: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]): void {
    this.transform.position.set(...position); this.transform.scale.set(...size); this.transform.rotation.set(...rotation); this.transform.updateMatrix();
    let baked = geometry.clone().applyMatrix4(this.transform.matrix);
    if (baked.index) { const indexed = baked; baked = indexed.toNonIndexed(); indexed.dispose(); }
    const list = this.parts.get(material) ?? []; list.push(baked); this.parts.set(material, list);
  }
  box(material: T.Material, size: Vec3, position: Vec3, rotation: Vec3 = [0, 0, 0]): void { this.add(block, material, position, size, rotation); }
  cylinder(material: T.Material, radius: number, length: number, position: Vec3): void { this.add(cylinder, material, position, [radius, length, radius], [Math.PI / 2, 0, 0]); }
  ring(material: T.Material, radius: number, thickness: number, position: Vec3): void { this.add(ringGeometry(radius, thickness), material, position); }
  beam(material: T.Material, from: Vec3, to: Vec3, width: number, depth = width): void {
    const start = new T.Vector3(...from), end = new T.Vector3(...to);
    const direction = end.clone().sub(start);
    this.transform.position.copy(start).add(end).multiplyScalar(.5);
    this.transform.scale.set(width, direction.length(), depth);
    this.transform.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); this.transform.updateMatrix();
    const baked = block.clone().applyMatrix4(this.transform.matrix);
    const list = this.parts.get(material) ?? []; list.push(baked); this.parts.set(material, list);
  }
  bake(): Template {
    const template: Template = [];
    for (const [material, geometries] of this.parts) {
      const geometry = mergeGeometries(geometries, false)!; geometry.computeBoundingSphere();
      geometries.forEach(part => part.dispose()); template.push({ geometry, material });
    }
    return template;
  }
}

function instantiate(parent: T.Object3D, key: string, build: (parts: Parts) => void): void {
  let template = templateCache.get(key);
  if (!template) { const parts = new Parts(); build(parts); template = parts.bake(); templateCache.set(key, template); }
  for (const { geometry, material } of template) {
    const mesh = new T.Mesh(geometry, material); mesh.name = 'Промышленная обшивка'; parent.add(mesh);
  }
}

function buildHull(p: Parts): void {
  // The central hull has depth, bridges and negative spaces around its front core.
  p.box(graphite, [20.8, 5.6, 12], [0, -.15, -1.8]);
  p.box(inset, [19.6, 1.4, 13], [0, -2.1, -1.8]);
  p.box(ochre, [20.6, .38, 10.6], [0, 2.7, -1.7]);
  p.box(graphite, [4.8, 7.1, 5.8], [-5.5, .1, 4.25]);
  p.box(graphite, [5.3, 8.0, 5.2], [5.9, -.7, 3.8]);
  p.box(inset, [2.5, 5.5, .35], [-5.3, .1, 7.17]);
  p.box(ochre, [.8, 6.6, .23], [-7.27, .1, 7.21]);
  p.box(ochre, [1.5, 7.3, .25], [7.3, -.7, 6.45], [0, 0, -.15]);
  p.box(steel, [.27, 7.0, .3], [3.28, -.7, 6.44]);
  p.box(steel, [.23, 6.2, .3], [-3.17, .1, 7.2]);
  p.box(inset, [3.1, .8, .16], [5.9, 1.8, 6.49]);

  // Wide trusses carry the drill head; the spaces between them stay visible.
  p.box(inset, [7.8, 1.1, 7.2], [-11.4, -1.2, 1.1]);
  p.beam(steel, [-8.5, 2.6, -.5], [-13.2, 1.7, 6.2], .38);
  p.beam(steel, [-8.5, -2.8, -.5], [-13.2, -2.9, 6.2], .38);
  p.beam(ochre, [-9.3, 1.8, 0], [-15.1, -.6, 5.4], .22);
  p.beam(ochre, [-9.3, -2.6, 0], [-15.1, -.6, 5.4], .22);
  for (const y of [-2.4, 1.8]) for (let strut = 0; strut < 4; strut++) {
    p.beam(steel, [-8.7 - strut * 1.35, y, .7 + strut * .85], [-9.7 - strut * 1.35, -y * .35, 1.1 + strut * .85], .15);
  }
  p.cylinder(inset, 3.8, 1.15, [-12.6, -.7, 5.8]);
  p.ring(steel, 4.18, .17, [-12.6, -.7, 6.2]);
  p.box(graphite, [6.8, 1.2, 6.1], [10.5, -2.6, 1.5]);
  p.cylinder(inset, 2.6, 1, [10.3, -3, 5.3]);

  // An asymmetric crane and exposed hydraulic cylinders echo the concept.
  p.box(ochre, [2.2, 2.0, 3.6], [10.4, 1.9, -.4]);
  p.beam(ochre, [10.4, 2.9, -.5], [13.2, 6.7, 1.8], .85, 1.1);
  p.beam(ochre, [13.2, 6.7, 1.8], [17.5, 3.0, 4.8], .72, .9);
  p.beam(inset, [10.7, 3.0, .05], [16.8, 3.8, 4.6], .2);
  p.beam(steel, [10.6, 3.0, -.15], [12.9, 6.0, 1.6], .24);
  p.beam(steel, [13.6, 5.5, 2.2], [16.8, 3.3, 4.55], .24);
  for (const [x, y, z, radius] of [[10.4, 2.95, .2, .63], [13.2, 6.7, 2.0, .55], [17.4, 3.0, 5.2, .48]]) {
    p.cylinder(inset, radius, 1.0, [x, y, z]); p.ring(steel, radius * .76, .08, [x, y, z + .53]);
  }
  p.beam(steel, [17.4, 2.7, 4.8], [17.5, 1.1, 5.3], .43);
  p.beam(graphite, [17.5, 1.2, 5.3], [16.4, -.4, 5.9], .34);
  p.beam(graphite, [17.5, 1.2, 5.3], [18.25, -.25, 5.8], .34);

  // Two uneven superstructures, ribs, cooling decks and navigation lamps.
  p.box(graphite, [3.3, 3.4, 4.0], [5.4, 4.45, -2.1]);
  p.box(inset, [2.9, .65, 4.2], [5.4, 6.23, -2.1]);
  p.box(ochre, [.65, 4.1, 2.9], [6.36, 4.8, -1.9]);
  p.box(graphite, [2.5, 2.2, 2.4], [-4.4, 3.75, -3.6]);
  p.box(steel, [.17, 1.9, .17], [5.3, 7.26, -2.4]);
  p.box(amber, [.18, .22, .18], [5.3, 8.24, -2.4]);
  for (let rib = 0; rib < 7; rib++) {
    const x = -8.6 + rib * 2.7;
    p.box(steel, [.2, .2, 8.0], [x, 2.99, -2.0]);
    p.box(graphite, [1.5, .18, 5.2], [x + .7, 3.01, -2.0]);
    p.box(steel, [.19, 4.4, .27], [x, -.1, -7.87]);
    p.box(amber, [.25, .12, .08], [x, 2.57, 4.33]);
  }
  for (const x of [-7.3, -3.05, 3.3, 8.0]) for (const y of [-2.5, 2.3]) {
    p.box(amber, [.13, .26, .08], [x, y, 7.3]);
  }
  for (let slit = 0; slit < 5; slit++) p.box(amber, [.21, .15, .08], [4.45 + slit * .45, 5.37, .0]);
  for (let louver = 0; louver < 6; louver++) p.box(steel, [1.8, .11, .24], [-5.3, -.85 + louver * .3, 7.39]);
  for (const x of [-6.9, 6.9]) {
    p.box(inset, [1.2, 1.0, 4.6], [x, -3.1, -4.3]);
    p.ring(ochre, .9, .16, [x, -2.0, -8.0]);
    p.cylinder(amber, .67, .035, [x, -2.0, -8.0]);
  }

  // Geometry markings are crisp at close range and need no text atlas or raster.
  for (let stripe = 0; stripe < 4; stripe++) p.box(inset, [.33, 1.7, .04], [7.28, -2.75 + stripe * .95, 6.61], [0, 0, -.6]);
  const digitX = 5.65, digitY = -.17, z = 6.54;
  for (const x of [digitX - .6, digitX + .12]) for (const side of [-1, 1]) p.box(pale, [.09, .57, .04], [x + side * .2, digitY, z]);
  for (const y of [-.32, .32]) p.box(pale, [.42, .09, .04], [digitX - .6, digitY + y, z]);
  p.box(pale, [.42, .09, .04], [digitX + .12, digitY + .32, z]);
  p.box(graphite, [.1, .59, .055], [digitX - .08, digitY, z + .03]);

  p.cylinder(inset, 2.42, 2, [0, 0, 6.9]);
  p.ring(ochre, 2.52, .24, [0, 0, 8.05]);
  p.ring(steel, 1.93, .12, [0, 0, 8.25]);
  p.ring(cyan, 1.28, .055, [0, 0, 8.42]);
  for (let spoke = 0; spoke < 8; spoke++) {
    const angle = spoke * Math.PI / 4;
    p.box(steel, [.2, .86, .19], [Math.sin(angle) * 1.94, Math.cos(angle) * 1.94, 8.23], [0, 0, -angle]);
    p.box(cyan, [.09, .45, .06], [Math.sin(angle) * 1.01, Math.cos(angle) * 1.01, 8.53], [0, 0, -angle]);
  }
}

function createDrill(radius: number): T.Group {
  const drill = new T.Group(); drill.name = 'Кольцевой бур';
  instantiate(drill, `drill:${radius}`, p => {
    p.ring(graphite, radius, .45, [0, 0, 0]);
    p.ring(ochre, radius - .26, .25, [0, 0, .44]);
    p.ring(steel, radius - 1.02, .15, [0, 0, .55]);
    p.cylinder(inset, radius - 1.25, .55, [0, 0, .03]);
    p.cylinder(steel, .76, .78, [0, 0, .4]);
    p.ring(ochre, .96, .1, [0, 0, .83]);
    for (let tooth = 0; tooth < 16; tooth++) {
      const angle = tooth * Math.PI / 8, x = Math.cos(angle), y = Math.sin(angle);
      p.box(steel, [.47, .62, .92], [x * radius, y * radius, .56], [0, 0, angle - .28]);
      p.box(graphite, [.31, .48, .21], [x * radius, y * radius, 1.08], [0, 0, angle - .28]);
      if (tooth % 2 === 0) p.box(ochre, [.21, .53, .15], [x * (radius - .72), y * (radius - .72), .77], [0, 0, angle]);
    }
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = spoke * Math.PI / 3;
      p.beam(graphite, [Math.cos(angle) * .7, Math.sin(angle) * .7, .2], [Math.cos(angle) * (radius - .75), Math.sin(angle) * (radius - .75), .28], .24, .29);
      p.box(amber, [.12, .25, .04], [Math.cos(angle) * (radius - .47), Math.sin(angle) * (radius - .47), .74], [0, 0, angle]);
    }
  });
  return drill;
}

function createTurret(scale: number): { root: T.Group; muzzle: T.Object3D } {
  const root = new T.Group(); root.name = 'Защитная турель'; root.scale.setScalar(scale);
  instantiate(root, 'turret', p => {
    p.cylinder(graphite, .62, .5, [0, -.1, 0]);
    p.box(ochre, [1.35, .75, .94], [0, .16, .1]);
    p.box(inset, [.8, .45, .2], [0, .23, .67]);
    for (const side of [-1, 1]) {
      p.cylinder(steel, .145, 1.62, [side * .31, .21, 1.35]);
      p.cylinder(graphite, .205, .35, [side * .31, .21, 1.99]);
      p.cylinder(red, .12, .04, [side * .31, .21, 2.185]);
    }
    p.box(amber, [.18, .14, .07], [0, .54, .56]);
  });
  const muzzle = new T.Object3D(); muzzle.name = 'Точка огня турели'; muzzle.position.set(0, .21, 2.22);
  root.add(muzzle); return { root, muzzle };
}

function createShutter(side: number): T.Group {
  const shutter = new T.Group(); shutter.name = 'Бронезаслонка реактора';
  shutter.position.set(side * 1.17, 0, 8.96);
  shutter.userData.side = side; shutter.userData.closedX = shutter.position.x;
  instantiate(shutter, `shutter:${side}`, p => {
    p.box(graphite, [2.3, 4.67, .36], [0, 0, 0]);
    p.box(ochre, [.38, 4.43, .11], [side * .82, 0, .24]);
    p.box(steel, [.1, 4.36, .1], [-side * .93, 0, .23]);
    p.box(inset, [1.21, 3.2, .15], [-side * .03, 0, .28]);
    for (let rib = 0; rib < 4; rib++) p.box(steel, [1.45, .11, .14], [0, -1.25 + rib * .84, .39]);
    for (let stripe = 0; stripe < 3; stripe++) p.box(inset, [.21, 1.05, .035], [side * .83, -.95 + stripe * .98, .31], [0, 0, -.48]);
  });
  return shutter;
}

/** Industrial capital ship. +Z is its armored front and its exposed reactor. */
export function createMiningBossModel(): MiningBossModel {
  const root = new T.Group(); root.name = 'Сердце карьера — добывающий крейсер';
  instantiate(root, 'hull', buildHull);
  const drills = [createDrill(4.08), createDrill(2.78)];
  drills[0].position.set(-12.6, -.7, 6.78); drills[1].position.set(10.3, -3, 6.0);
  drills.forEach((drill, index) => { drill.userData.rotationSpeed = index === 0 ? .24 : -.34; root.add(drill); });

  const turrets: T.Object3D[] = [];
  for (const [x, y, z, scale] of [[-5.5, 2.75, 7.17, 1], [5.6, 2.18, 6.45, 1], [-4.4, 4.8, -1.9, .72], [5.4, 6.58, -.3, .72]]) {
    const turret = createTurret(scale); turret.root.position.set(x, y, z); root.add(turret.root); turrets.push(turret.muzzle);
  }
  const reactor = new T.Object3D(); reactor.name = 'Уязвимое сердце реактора'; reactor.position.set(0, 0, 8.85); root.add(reactor);
  // This material is deliberately local: phase changes must not recolor trim.
  const reactorMaterial = new T.MeshStandardMaterial({ color: 0x86eaff, emissive: 0x2dd5ff, emissiveIntensity: 1.9, metalness: .2, roughness: .22 });
  const reactorGlow = new T.Mesh(cylinder, reactorMaterial); reactorGlow.name = 'Энергетическое ядро';
  reactorGlow.position.set(0, 0, 8.74); reactorGlow.rotation.x = Math.PI / 2; reactorGlow.scale.set(.59, .14, .59); root.add(reactorGlow);
  const shutters = [-1, 1].map(createShutter); shutters.forEach(shutter => root.add(shutter));
  root.userData.dimensions = { width: 35.6, height: 14.6, depth: 17.7 };
  return { root, reactor, drills, turrets, reactorGlow, shutters };
}
