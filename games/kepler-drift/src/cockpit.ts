import * as T from 'three';

export interface CockpitTelemetry {
  speed: number;
  /** Engine command from 0 to 1. */
  throttle: number;
  boost: boolean;
  /** Remaining shield and hull, as percentages from 0 to 100. */
  shield: number;
  hull: number;
  ore: number;
}

export interface CockpitModel {
  root: T.Group;
  update(telemetry: CockpitTelemetry): void;
  dispose(): void;
}

type Position = [number, number, number];
type Display = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: T.CanvasTexture;
};

const ink = '#a8dcef';
const creamInk = '#e6e8dc';
const mutedInk = '#63919f';
const amberInk = '#f6b45e';

/** A camera-local interior. The open canopy looks along the camera's -Z axis. */
export function createCockpit(): CockpitModel {
  const root = new T.Group();
  root.name = 'KEP-01 — flight deck';

  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  function material<M extends T.Material>(value: M): M {
    materials.add(value);
    return value;
  }

  const armor = material(new T.MeshStandardMaterial({
    color: 0x141c23, metalness: 0.68, roughness: 0.51,
    emissive: 0x07121a, emissiveIntensity: 0.14,
  }));
  const panel = material(new T.MeshStandardMaterial({
    color: 0x26343d, metalness: 0.64, roughness: 0.46,
  }));
  const black = material(new T.MeshStandardMaterial({
    color: 0x090f14, metalness: 0.35, roughness: 0.72,
  }));
  const cream = material(new T.MeshStandardMaterial({
    color: 0xc8d4dc, metalness: 0.5, roughness: 0.43,
  }));
  const orange = material(new T.MeshStandardMaterial({
    color: 0xbf5625, metalness: 0.48, roughness: 0.43,
  }));
  const metal = material(new T.MeshStandardMaterial({
    color: 0x53616c, metalness: 0.82, roughness: 0.33,
  }));
  const cyan = material(new T.MeshBasicMaterial({ color: 0x8bcee5, toneMapped: false }));
  const amber = material(new T.MeshBasicMaterial({ color: 0xe2a154, toneMapped: false }));

  function mesh(geometry: T.BufferGeometry, surface: T.Material, parent: T.Object3D, position: Position = [0, 0, 0]): T.Mesh {
    geometries.add(geometry);
    const item = new T.Mesh(geometry, surface);
    item.position.set(...position);
    item.castShadow = false;
    item.receiveShadow = false;
    parent.add(item);
    return item;
  }

  function box(parent: T.Object3D, surface: T.Material, size: Position, position: Position): T.Mesh {
    return mesh(new T.BoxGeometry(...size), surface, parent, position);
  }

  // The chamfered profiles are actual extruded housings, including their side walls.
  function housing(parent: T.Object3D, surface: T.Material, width: number, height: number, depth: number, position: Position, cut = 0.025): T.Mesh {
    const w = width / 2, h = height / 2;
    const shape = new T.Shape();
    shape.moveTo(-w + cut, -h);
    shape.lineTo(w - cut, -h);
    shape.lineTo(w, -h + cut);
    shape.lineTo(w, h - cut);
    shape.lineTo(w - cut, h);
    shape.lineTo(-w + cut, h);
    shape.lineTo(-w, h - cut);
    shape.lineTo(-w, -h + cut);
    shape.closePath();
    const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    geometry.translate(0, 0, -depth / 2);
    return mesh(geometry, surface, parent, position);
  }

  function beam(surface: T.Material, start: Position, end: Position, width: number, depth = width): T.Mesh {
    const a = new T.Vector3(...start), b = new T.Vector3(...end);
    const direction = b.clone().sub(a);
    const item = box(root, surface, [width, direction.length(), depth], a.clone().add(b).multiplyScalar(0.5).toArray() as Position);
    item.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
    return item;
  }

  // Recessed lower shell and long side sills make the instruments sit inside a cabin.
  const dashboard = housing(root, armor, 2.47, 0.42, 0.36, [0, -0.88, -1.67], 0.14);
  dashboard.rotation.x = -0.11;
  housing(root, black, 1.88, 0.27, 0.43, [0, -1.09, -1.28], 0.08);
  const centerTunnel = housing(root, panel, 0.7, 0.58, 0.61, [0, -0.96, -1.1], 0.055);
  centerTunnel.rotation.x = -0.14;
  box(root, black, [2.13, 0.055, 0.12], [0, -0.661, -1.83]);
  box(root, metal, [1.39, 0.015, 0.045], [0, -0.632, -1.84]);

  for (const side of [-1, 1]) {
    const cheek = housing(root, panel, 0.38, 0.35, 0.94, [side * 1.02, -0.93, -1.3], 0.05);
    cheek.rotation.y = -side * 0.16;
    const sill = box(root, armor, [0.17, 0.19, 1.58], [side * 1.19, -0.88, -1.26]);
    sill.rotation.y = -side * 0.15;
    const sillTrim = box(root, cream, [0.035, 0.028, 1.27], [side * 1.13, -0.761, -1.34]);
    sillTrim.rotation.y = -side * 0.15;
    const orangeTrim = box(root, orange, [0.068, 0.034, 0.54], [side * 1.073, -0.754, -1.73]);
    orangeTrim.rotation.y = -side * 0.15;
    for (let i = 0; i < 4; i++) {
      box(root, black, [0.16, 0.012, 0.048], [side * 1.015, -0.739, -1.16 - i * 0.081]);
    }

    // Narrow side pillars; the central window and the whole upper centre stay open.
    const lower: Position = [side * 1.19, -0.73, -1.89];
    const upper: Position = [side * 1.79, 1.62, -2.38];
    beam(armor, lower, upper, 0.062, 0.075);
    beam(cream,
      [lower[0] - side * 0.023, lower[1], lower[2] + 0.04],
      [upper[0] - side * 0.023, upper[1], upper[2] + 0.04],
      0.016, 0.014);
    housing(root, metal, 0.125, 0.155, 0.11, [side * 1.175, -0.72, -1.84], 0.026);
    box(root, orange, [0.027, 0.16, 0.016], [side * 1.16, -0.722, -1.773]);
  }

  function display(parent: T.Group, width: number, height: number, position: Position): Display {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cockpit instruments require a 2D canvas context.');
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = T.LinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.generateMipmaps = false;
    textures.add(texture);
    const surface = material(new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh(new T.PlaneGeometry(width, height), surface, parent, position);
    return { canvas, context, texture };
  }

  function instrument(position: Position, width: number, height: number, yaw: number): { group: T.Group; screen: Display } {
    const group = new T.Group();
    group.position.set(...position);
    group.rotation.set(-0.28, yaw, 0);
    root.add(group);
    housing(group, armor, width + 0.087, height + 0.085, 0.115, [0, 0, 0], 0.028);
    housing(group, metal, width + 0.022, height + 0.023, 0.008, [0, 0, 0.061], 0.012);
    const screen = display(group, width, height, [0, 0, 0.067]);
    // Physical lower edge, status lamp, and two fasteners are outside the image.
    box(group, black, [width * 0.57, 0.011, 0.015], [0, -height / 2 - 0.025, 0.065]);
    box(group, cyan, [0.032, 0.008, 0.009], [-width / 2 + 0.013, -height / 2 - 0.025, 0.066]);
    const screwGeometry = new T.CylinderGeometry(0.008, 0.008, 0.005, 8);
    for (const side of [-1, 1]) {
      const screw = mesh(screwGeometry, metal, group, [side * (width / 2 + 0.025), height / 2 + 0.02, 0.06]);
      screw.rotation.x = Math.PI / 2;
    }
    return { group, screen };
  }

  const flight = instrument([0, -0.582, -1.38], 0.57, 0.28, 0);
  const systems = instrument([-0.705, -0.628, -1.48], 0.46, 0.245, 0.18);
  const cargo = instrument([0.705, -0.628, -1.48], 0.46, 0.245, -0.18);
  flight.group.name = 'Flight instruments';
  systems.group.name = 'Shield and hull monitor';
  cargo.group.name = 'Ore cargo monitor';

  // A compact manual throttle and a guarded control bank below the screens.
  const throttle = new T.Group();
  throttle.position.set(-0.432, -0.788, -1.19);
  throttle.rotation.x = -0.25;
  root.add(throttle);
  housing(throttle, black, 0.085, 0.125, 0.05, [0, 0, 0], 0.014);
  box(throttle, metal, [0.006, 0.088, 0.012], [0, 0, 0.03]);
  const throttleGrip = housing(throttle, orange, 0.063, 0.03, 0.035, [0, -0.04, 0.053], 0.007);
  box(throttleGrip, cream, [0.024, 0.006, 0.005], [0, 0.007, 0.02]);
  const controls = new T.Group();
  controls.position.set(0.429, -0.778, -1.24);
  controls.rotation.x = -0.28;
  root.add(controls);
  housing(controls, black, 0.12, 0.10, 0.05, [0, 0, 0], 0.017);
  for (let i = 0; i < 3; i++) {
    const lever = box(controls, metal, [0.009, 0.041, 0.018], [-0.033 + i * 0.033, 0, 0.045]);
    lever.rotation.x = -0.35;
    box(controls, i === 2 ? amber : cream, [0.014, 0.012, 0.02], [-0.033 + i * 0.033, 0.022, 0.056]);
  }

  // Local soft fill keeps the front faces legible without shadows or animated light.
  const coolFill = new T.PointLight(0x9bcbdc, 2.2, 3.2, 2);
  coolFill.position.set(-0.22, -0.12, -0.46);
  root.add(coolFill);
  const warmFill = new T.PointLight(0xf0b58b, 1.15, 2.7, 2);
  warmFill.position.set(0.92, -0.3, -0.62);
  root.add(warmFill);

  function begin(screen: Display, title: string, status: string): CanvasRenderingContext2D {
    const context = screen.context;
    context.fillStyle = '#08151c';
    context.fillRect(0, 0, screen.canvas.width, screen.canvas.height);
    context.fillStyle = '#0d212b';
    context.fillRect(0, 0, 1024, 87);
    context.strokeStyle = '#28424c';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(40, 88);
    context.lineTo(984, 88);
    context.stroke();
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.font = '500 35px monospace';
    context.fillStyle = ink;
    context.fillText(title, 43, 57);
    context.textAlign = 'right';
    context.font = '500 26px monospace';
    context.fillStyle = mutedInk;
    context.fillText(status, 980, 54);
    context.textAlign = 'left';
    return context;
  }

  function label(context: CanvasRenderingContext2D, text: string, x: number, y: number, color = mutedInk, size = 30): void {
    context.fillStyle = color;
    context.font = `500 ${size}px monospace`;
    context.fillText(text, x, y);
  }

  function bar(context: CanvasRenderingContext2D, x: number, y: number, width: number, value: number, color: string): void {
    context.fillStyle = '#1a303a';
    context.fillRect(x, y, width, 19);
    context.fillStyle = color;
    context.fillRect(x, y, width * value / 100, 19);
    context.fillStyle = '#08151c';
    for (let i = 1; i < 10; i++) context.fillRect(x + width * i / 10 - 2, y, 4, 19);
  }

  let flightKey = '', systemsKey = '', cargoKey = '';
  let disposed = false;

  function update(telemetry: CockpitTelemetry): void {
    if (disposed) return;
    const finite = (value: number): number => Number.isFinite(value) ? value : 0;
    const speed = Math.round(Math.max(0, finite(telemetry.speed)));
    const thrust = Math.round(T.MathUtils.clamp(finite(telemetry.throttle), 0, 1) * 100);
    const shield = Math.round(T.MathUtils.clamp(finite(telemetry.shield), 0, 100));
    const hull = Math.round(T.MathUtils.clamp(finite(telemetry.hull), 0, 100));
    const ore = Math.floor(Math.max(0, finite(telemetry.ore)));
    const boost = Boolean(telemetry.boost);
    throttleGrip.position.y = -0.04 + thrust / 100 * 0.08;

    const nextFlightKey = `${speed}:${thrust}:${boost}`;
    if (nextFlightKey !== flightKey) {
      flightKey = nextFlightKey;
      const context = begin(flight.screen, 'KEP-01 / FLIGHT', boost ? 'BOOST' : 'CRUISE');
      label(context, 'VELOCITY', 44, 141);
      context.font = '500 164px monospace';
      context.fillStyle = creamInk;
      context.fillText(String(speed).padStart(3, '0'), 37, 301);
      label(context, 'M/S', 658, 298, ink, 39);
      context.strokeStyle = '#28424c';
      context.beginPath();
      context.moveTo(44, 339);
      context.lineTo(980, 339);
      context.stroke();
      label(context, 'THRUST', 44, 396);
      context.textAlign = 'right';
      label(context, `${thrust}%`, 980, 396, boost ? amberInk : ink, 35);
      context.textAlign = 'left';
      bar(context, 44, 423, 936, thrust, boost ? amberInk : ink);
      label(context, boost ? 'HIGH OUTPUT' : 'FLIGHT SYSTEMS ONLINE', 44, 487, boost ? amberInk : mutedInk, 24);
      flight.screen.texture.needsUpdate = true;
    }

    const nextSystemsKey = `${shield}:${hull}`;
    if (nextSystemsKey !== systemsKey) {
      systemsKey = nextSystemsKey;
      const context = begin(systems.screen, 'SYSTEMS', 'KEP-01');
      const shieldColor = shield < 25 ? amberInk : ink;
      const hullColor = hull < 35 ? amberInk : creamInk;
      label(context, 'SHIELD', 44, 154, mutedInk, 35);
      context.textAlign = 'right';
      label(context, `${shield}%`, 978, 202, shieldColor, 84);
      context.textAlign = 'left';
      bar(context, 44, 232, 934, shield, shieldColor);
      label(context, 'HULL', 44, 329, mutedInk, 35);
      context.textAlign = 'right';
      label(context, `${hull}%`, 978, 378, hullColor, 84);
      context.textAlign = 'left';
      bar(context, 44, 409, 934, hull, hullColor);
      label(context, hull < 35 ? 'HULL INTEGRITY LOW' : 'INTEGRITY MONITOR', 44, 488, hull < 35 ? amberInk : mutedInk, 25);
      systems.screen.texture.needsUpdate = true;
    }

    const nextCargoKey = `${ore}`;
    if (nextCargoKey !== cargoKey) {
      cargoKey = nextCargoKey;
      const context = begin(cargo.screen, 'CARGO', 'MINING');
      label(context, 'ORE COLLECTED', 44, 152, mutedInk, 35);
      context.font = `500 ${ore >= 100000 ? 107 : 148}px monospace`;
      context.fillStyle = amberInk;
      context.fillText(ore.toLocaleString('en-US'), 36, 307);
      context.strokeStyle = '#28424c';
      context.beginPath();
      context.moveTo(44, 343);
      context.lineTo(980, 343);
      context.stroke();
      label(context, 'MANIFEST', 44, 396, mutedInk, 31);
      label(context, ore > 0 ? 'MINERAL LOAD STORED' : 'CARGO HOLD EMPTY', 44, 444, ore > 0 ? ink : mutedInk, 31);
      label(context, 'KEPLER EXPLORATION / 01', 44, 488, mutedInk, 25);
      cargo.screen.texture.needsUpdate = true;
    }
  }

  update({ speed: 0, throttle: 0, boost: false, shield: 100, hull: 100, ore: 0 });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    root.clear();
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
  }

  return { root, update, dispose };
}
