import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type PirateKind = 'fighter' | 'sniper';
export interface PirateModel {
  root: T.Group;
  muzzles: T.Object3D[];
  flames: T.Mesh[];
}

// These are model resources, shared by the whole fleet rather than each spawn.
const graphite = new T.MeshStandardMaterial({ color: 0x222a34, metalness: .72, roughness: .38, flatShading: true });
const armor = new T.MeshStandardMaterial({ color: 0x495664, metalness: .78, roughness: .32, flatShading: true });
const bronze = new T.MeshStandardMaterial({ color: 0xa47b4d, metalness: .72, roughness: .39, flatShading: true });
const coral = new T.MeshStandardMaterial({ color: 0xe45b40, emissive: 0xa62513, emissiveIntensity: .62, metalness: .4, roughness: .42 });
const amber = new T.MeshStandardMaterial({ color: 0xffd49a, emissive: 0xff941e, emissiveIntensity: 1.7, roughness: .28 });
const cockpit = new T.MeshPhysicalMaterial({ color: 0x173343, metalness: .62, roughness: .15, clearcoat: 1 });
const charge = new T.MeshStandardMaterial({ color: 0xfe8663, emissive: 0xeb3e1d, emissiveIntensity: 1.4, roughness: .32 });
const exhaust = new T.ShaderMaterial({
  transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec2 vUv;void main(){float a=pow(1.-vUv.y,1.8);float edge=pow(abs(sin(vUv.x*6.283185)),1.3);vec3 c=mix(vec3(1.,.28,.06),vec3(1.,.86,.47),a);gl_FragColor=vec4(c,a*edge*.42);}',
});

const cube = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
const flameGeometry = new T.ConeGeometry(1, 1, 18, 1, true);
const geometryCache = new Map<string, T.BufferGeometry>();
type Vec3 = [number, number, number];
type Template = Array<{ geometry: T.BufferGeometry; material: T.Material }>;
const templates = new Map<PirateKind, Template>();

function cached(key: string, make: () => T.BufferGeometry): T.BufferGeometry {
  let geometry = geometryCache.get(key);
  if (!geometry) { geometry = make(); geometryCache.set(key, geometry); }
  return geometry;
}

function plate(points: ReadonlyArray<readonly [number, number]>, thickness: number): T.BufferGeometry {
  return cached(`plate:${JSON.stringify(points)}:${thickness}`, () => {
    const shape = new T.Shape();
    points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 1, bevelSize: .025, bevelThickness: .025, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
}

function fuselage(kind: PirateKind): T.BufferGeometry {
  return cached(`hull:${kind}`, () => {
    // The octagonal sections pinch into a prow: neither enemy is a box with wings.
    const sections: Vec3[] = kind === 'fighter'
      ? [[-1.6, .38, .22], [-.85, .61, .33], [.65, .49, .28], [1.85, .08, .075]]
      : [[-2.05, .39, .21], [-1.3, .55, .29], [1.1, .32, .2], [2.55, .065, .06]];
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (const [z, width, height] of sections) for (let side = 0; side < 8; side++) {
      const angle = side * Math.PI / 4 + Math.PI / 8;
      positions.push(Math.cos(angle) * width, Math.sin(angle) * height, z);
      uv.push(side / 8, (z + 3) / 6);
    }
    for (let section = 0; section < sections.length - 1; section++) for (let side = 0; side < 8; side++) {
      const a = section * 8 + side, b = section * 8 + (side + 1) % 8;
      indices.push(a, b, a + 8, b, b + 8, a + 8);
    }
    for (let side = 1; side < 7; side++) {
      indices.push(0, side + 1, side);
      const end = (sections.length - 1) * 8;
      indices.push(end, end + side, end + side + 1);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const faceted = geometry.toNonIndexed(); geometry.dispose();
    faceted.computeVertexNormals();
    return faceted;
  });
}

function buildTemplate(kind: PirateKind): Template {
  const parts = new Map<T.Material, T.BufferGeometry[]>();
  const transform = new T.Object3D();
  const add = (geometry: T.BufferGeometry, material: T.Material, position: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1], rotation: Vec3 = [0, 0, 0]): void => {
    transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
    let baked = geometry.clone().applyMatrix4(transform.matrix);
    if (baked.index) { const indexed = baked; baked = indexed.toNonIndexed(); indexed.dispose(); }
    const list = parts.get(material) ?? []; list.push(baked); parts.set(material, list);
  };
  const box = (material: T.Material, size: Vec3, position: Vec3, rotation: Vec3 = [0, 0, 0]): void => add(cube, material, position, size, rotation);
  const tube = (material: T.Material, radius: number, length: number, position: Vec3): void => add(cylinder, material, position, [radius, length, radius], [Math.PI / 2, 0, 0]);
  const ring = (material: T.Material, radius: number, tubeRadius: number, position: Vec3): void => {
    const geometry = cached(`ring:${radius}:${tubeRadius}`, () => new T.TorusGeometry(radius, tubeRadius, 6, 20));
    add(geometry, material, position);
  };

  add(fuselage(kind), graphite);
  box(armor, [.32, .13, kind === 'fighter' ? 2.5 : 3.6], [0, -.24, kind === 'fighter' ? .1 : .3]);
  add(plate([[-.36, -.75], [-.22, .85], [0, 1.65], [.22, .85], [.36, -.75]], .055), armor, [0, .24, 0]);
  const glass = cached('cockpit', () => new T.SphereGeometry(1, 12, 8));
  add(glass, cockpit, [0, .35, kind === 'fighter' ? -.36 : -.88], [.32, .2, .61]);
  box(bronze, [.065, .05, .93], [0, .55, kind === 'fighter' ? -.33 : -.85]);
  for (let vent = 0; vent < 4; vent++) box(armor, [.48, .055, .065], [0, .3, -1.1 + vent * .16]);

  for (const side of [-1, 1]) {
    const wing: [number, number][] = kind === 'fighter'
      ? [[side * .43, .91], [side * 1.1, .21], [side * 2.18, -1.5], [side * 2.1, -1.73], [side * .37, -1.04]]
      : [[side * .31, .73], [side * 2.35, -1.32], [side * 2.17, -1.94], [side * .37, -.81]];
    add(plate(wing, .12), graphite, [0, -.03, 0]);
    add(plate(wing.map(([x, z]) => [x * .92, z * .93]), .03), armor, [0, .115, 0]);
    const accent: [number, number][] = [[side * .67, -.54], [side * (kind === 'fighter' ? 1.93 : 2.1), -1.35], [side * (kind === 'fighter' ? 1.84 : 2.01), -1.43], [side * .69, -.66]];
    add(plate(accent, .025), coral, [0, .17, 0]);

    const engineX = side * (kind === 'fighter' ? .93 : .76);
    tube(graphite, .32, 1.78, [engineX, -.055, -1.02]);
    tube(bronze, .34, .28, [engineX, -.055, -1.68]);
    tube(armor, .35, .18, [engineX, -.055, -1.91]);
    tube(amber, .25, .045, [engineX, -.055, -2.015]);
    ring(graphite, .285, .045, [engineX, -.055, -2.02]);
    // A raised canted stabilizer gives the silhouette a second visible plane.
    const fin = plate([[-.075, -.95], [.075, -1.13], [.11, -1.88], [-.08, -1.65]], .065);
    add(fin, graphite, [side * 1.48, .11, -.02], [1, 1, 1], [0, 0, side * .96]);

    const gunX = side * (kind === 'fighter' ? .53 : .41);
    tube(armor, kind === 'fighter' ? .1 : .13, kind === 'fighter' ? 1.4 : 2.2, [gunX, -.09, kind === 'fighter' ? 1.09 : 1.55]);
    tube(graphite, .16, .26, [gunX, -.09, kind === 'fighter' ? 1.58 : 2.39]);
    tube(coral, .12, .055, [gunX, -.09, kind === 'fighter' ? 1.79 : 2.69]);
    box(bronze, [.18, .035, .11], [side * (kind === 'fighter' ? 1.95 : 2.13), .165, -1.57]);
  }

  if (kind === 'sniper') {
    // The modest red accumulator distinguishes the telegraphed, heavier shot.
    tube(graphite, .27, .3, [0, .34, .94]);
    tube(charge, .155, .17, [0, .34, 1.115]);
    ring(bronze, .225, .04, [0, .34, 1.15]);
    box(graphite, [.065, .12, 1.45], [-.18, .42, 1.9]);
    box(graphite, [.065, .12, 1.45], [.18, .42, 1.9]);
  }
  const template: Template = [];
  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries, false)!;
    geometry.computeBoundingSphere();
    geometries.forEach(part => part.dispose());
    template.push({ geometry, material });
  }
  return template;
}

/** Original hard-surface pirate, facing the player along local +Z. */
export function createPirateModel(kind: PirateKind): PirateModel {
  let template = templates.get(kind);
  if (!template) { template = buildTemplate(kind); templates.set(kind, template); }
  const root = new T.Group();
  root.name = kind === 'fighter' ? 'Пират — «Коршун»' : 'Пират-снайпер — «Игла»';
  for (const { geometry, material } of template) {
    const mesh = new T.Mesh(geometry, material); mesh.name = 'Обшивка и механизмы'; root.add(mesh);
  }
  const muzzles: T.Object3D[] = [], flames: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    const muzzle = new T.Object3D();
    muzzle.name = 'Дуло';
    muzzle.position.set(side * (kind === 'fighter' ? .53 : .41), -.09, kind === 'fighter' ? 1.83 : 2.72);
    root.add(muzzle); muzzles.push(muzzle);
    const flame = new T.Mesh(flameGeometry, exhaust); flame.name = 'Янтарный выхлоп';
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(side * (kind === 'fighter' ? .93 : .76), -.055, -2.62);
    flame.scale.set(.25, 1.25, .25);
    flame.userData.baseScale = flame.scale.clone();
    flame.renderOrder = 1; root.add(flame); flames.push(flame);
  }
  root.userData.collisionRadius = kind === 'fighter' ? 2.4 : 3;
  return { root, muzzles, flames };
}
