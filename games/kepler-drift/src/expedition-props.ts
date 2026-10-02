import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface ExpeditionProps { root: T.Group; drones: T.Group[]; beacon: T.Group; }

const white = new T.MeshStandardMaterial({ color: 0xc9d9df, metalness: .54, roughness: .36, flatShading: true });
const orange = new T.MeshStandardMaterial({ color: 0xc76330, metalness: .5, roughness: .43 });
const dark = new T.MeshStandardMaterial({ color: 0x1e2b35, metalness: .72, roughness: .4, flatShading: true });
const steel = new T.MeshStandardMaterial({ color: 0x84959e, metalness: .84, roughness: .29 });
const bronze = new T.MeshStandardMaterial({ color: 0x9e7540, metalness: .64, roughness: .46 });
const cyan = new T.MeshStandardMaterial({ color: 0xc0eeff, emissive: 0x56c5ef, emissiveIntensity: 1.5, roughness: .26 });
const amber = new T.MeshStandardMaterial({ color: 0xffda98, emissive: 0xde902c, emissiveIntensity: 1.0, roughness: .35 });
const cube = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 12);
const sphere = new T.SphereGeometry(1, 12, 8);
const bevelledDroneBody = new T.CylinderGeometry(.25, .21, .46, 8);
const capRing = new T.TorusGeometry(.19, .025, 6, 16);
const beaconRing = new T.TorusGeometry(2.12, .095, 6, 40);
type Vec3 = [number, number, number];
type Template = Array<{ geometry: T.BufferGeometry; material: T.Material }>;
const templates = new Map<string, Template>();

class Parts {
  private readonly parts = new Map<T.Material, T.BufferGeometry[]>();
  private readonly transform = new T.Object3D();
  add(geometry: T.BufferGeometry, material: T.Material, position: Vec3 = [0, 0, 0], size: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]): void {
    this.transform.position.set(...position); this.transform.scale.set(...size); this.transform.rotation.set(...rotation); this.transform.updateMatrix();
    let baked = geometry.clone().applyMatrix4(this.transform.matrix);
    if (baked.index) { const indexed = baked; baked = indexed.toNonIndexed(); indexed.dispose(); }
    const parts = this.parts.get(material) ?? []; parts.push(baked); this.parts.set(material, parts);
  }
  box(material: T.Material, size: Vec3, position: Vec3, rotation: Vec3 = [0, 0, 0]): void { this.add(cube, material, position, size, rotation); }
  tube(material: T.Material, radius: number, length: number, position: Vec3): void { this.add(cylinder, material, position, [radius, length, radius], [Math.PI / 2, 0, 0]); }
  bake(): Template {
    const template: Template = [];
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false)!; geometry.computeBoundingSphere();
      parts.forEach(part => part.dispose()); template.push({ geometry, material });
    }
    return template;
  }
}

function instantiate(root: T.Object3D, key: string, make: (parts: Parts) => void): void {
  let template = templates.get(key);
  if (!template) { const parts = new Parts(); make(parts); template = parts.bake(); templates.set(key, template); }
  for (const { geometry, material } of template) root.add(new T.Mesh(geometry, material));
}

function createCollector(): T.Group {
  const drone = new T.Group(); drone.name = 'Добывающий дрон КЕП';
  instantiate(drone, 'collector', p => {
    p.add(bevelledDroneBody, white, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    p.tube(orange, .253, .12, [0, 0, .045]);
    p.tube(steel, .205, .045, [0, 0, .25]);
    p.tube(dark, .166, .08, [0, 0, .293]);
    p.tube(cyan, .087, .035, [0, 0, .338]);
    p.add(capRing, dark, [0, 0, -.235]);
    p.tube(dark, .139, .07, [0, 0, -.248]);
    p.tube(steel, .106, .035, [0, 0, -.29]);
    p.tube(cyan, .036, .02, [0, 0, -.319]);
    p.box(dark, [.17, .08, .19], [0, .235, -.05]);
    p.box(white, [.12, .025, .13], [0, .281, -.05]);
    for (const side of [-1, 1]) {
      p.box(dark, [.13, .08, .13], [side * .265, -.06, -.075]);
      p.box(orange, [.16, .09, .26], [side * .334, -.01, -.045], [0, 0, side * .17]);
      p.box(white, [.17, .028, .16], [side * .327, .078, .065], [0, 0, side * -.16]);
      p.box(steel, [.038, .045, .22], [side * .332, -.043, -.241]);
      p.box(steel, [.115, .037, .045], [side * .294, -.043, -.35], [0, side * .22, 0]);
      p.tube(cyan, .023, .014, [side * .326, .086, .159]);
    }
  });
  drone.userData.followSide = 1;
  return drone;
}

function createBeacon(): T.Group {
  const beacon = new T.Group(); beacon.name = 'Орбитальный эвакуационный маяк';
  instantiate(beacon, 'beacon', p => {
    p.box(dark, [.84, 4.3, .92], [0, -.15, 0]);
    p.box(bronze, [.17, 3.7, .19], [-.49, -.1, .38]);
    p.box(bronze, [.17, 3.7, .19], [.49, -.1, .38]);
    p.box(steel, [1.17, .14, 1.21], [0, 1.4, 0]);
    p.box(steel, [1.12, .14, 1.15], [0, -.75, 0]);
    p.box(dark, [1.42, .92, 1.38], [0, -1.93, 0]);
    p.box(bronze, [1.5, .15, 1.4], [0, -1.48, 0]);
    p.box(steel, [.11, 1.2, .11], [0, 2.55, 0]);
    p.add(sphere, amber, [0, 3.22, 0], [.12, .18, .12]);
    p.add(beaconRing, bronze, [0, 1.94, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    p.box(steel, [5.4, .16, .16], [0, .28, 0]);
    p.box(steel, [.15, .13, 2.8], [0, .28, 0]);
    for (const side of [-1, 1]) {
      p.box(dark, [1.51, .72, .13], [side * 1.69, .14, .24]);
      p.box(bronze, [1.62, .065, .21], [side * 1.7, .54, .26]);
      p.box(bronze, [1.62, .065, .21], [side * 1.7, -.25, .26]);
      p.box(amber, [.16, .13, .16], [side * 2.72, .3, 0]);
      p.box(amber, [.11, .13, .11], [0, .3, side * 1.48]);
      p.box(steel, [.07, 1.48, .07], [side * 1.28, 1.07, 0], [0, 0, side * -.67]);
      for (let rib = 0; rib < 5; rib++) p.box(steel, [.034, .52, .025], [side * (1.15 + rib * .27), .15, .315]);
    }
    for (let window = 0; window < 3; window++) p.box(amber, [.105, .15, .025], [-.24 + window * .24, .92, .481]);
    p.box(amber, [.13, .28, .025], [0, -1.89, .71]);
    p.box(orange, [.52, .43, .04], [0, -.2, .491]);
  });
  return beacon;
}

/** Root stays in world space; drones can follow the player independently. */
export function createExpeditionProps(): ExpeditionProps {
  const root = new T.Group(); root.name = 'Дроны и маяк экспедиции';
  const drones = [-1, 1].map(side => {
    const drone = createCollector(); drone.userData.followSide = side;
    drone.position.set(side * 3.9, .3, 3.8); root.add(drone); return drone;
  });
  const beacon = createBeacon(); beacon.position.set(15, 6, -70); root.add(beacon);
  return { root, drones, beacon };
}
