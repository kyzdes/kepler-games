import * as T from 'three';
import { mulberry32 } from './state.ts';

export function lightningEnvelope(age: number): number {
  if (age < 0 || age > 1.2) return 0;
  const pulse = (center: number, width: number) => Math.exp(-(((age - center) / width) ** 2));
  return pulse(.2, .11) + pulse(.59, .17) * .58;
}

interface StormCell {
  root: T.Group;
  core: T.MeshBasicMaterial;
  halo: T.MeshBasicMaterial;
  cloud: T.ShaderMaterial;
  age: number;
}

/** Surface-bound electrical storms. No global exposure or full-screen flashes. */
export class PlanetStorm {
  readonly root = new T.Group();
  private readonly rng = mulberry32(73109);
  private readonly cells: StormCell[] = [];
  private untilStrike = .65;
  private previous = -1;
  private readonly reducedMotion: boolean;

  constructor(reducedMotion = false) {
    this.reducedMotion = reducedMotion;
    const anchors: [number, number, number][] = [[.3, -.2, 1], [-.42, .1, 1], [.8, .2, .8], [-.05, .7, .82], [.15, -.7, .9], [.65, -.3, .8], [.5, .55, 1]];
    for (const anchor of anchors) this.cells.push(this.createCell(new T.Vector3(...anchor).normalize()));
    this.root.name = 'Грозы в атмосфере Кеплера';
    if (reducedMotion) this.paint(this.cells[0], .2);
  }

  private createCell(normal: T.Vector3): StormCell {
    const root = new T.Group(); root.visible = false; this.root.add(root);
    const core = new T.MeshBasicMaterial({ color: new T.Color(2.8, 3.6, 4.8), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    const halo = new T.MeshBasicMaterial({ color: new T.Color(.32, .85, 2.7), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    const u = new T.Vector3().crossVectors(normal, new T.Vector3(0, 1, 0)).normalize();
    const v = new T.Vector3().crossVectors(normal, u).normalize();
    const heading = this.rng() * Math.PI * 2;
    const surface = (x: number, y: number) => normal.clone().multiplyScalar(174)
      .addScaledVector(u, x * Math.cos(heading) - y * Math.sin(heading))
      .addScaledVector(v, x * Math.sin(heading) + y * Math.cos(heading)).normalize().multiplyScalar(174);
    const length = 43 + this.rng() * 24;
    const points: T.Vector2[] = [];
    for (let i = 0; i <= 22; i++) points.push(new T.Vector2((i / 22 - .5) * length, (this.rng() - .5) * 6 + Math.sin(i * .6) * 3));
    const addBolt = (path: T.Vector2[], thickness: number) => {
      const curve = new T.CurvePath<T.Vector3>();
      for (let i = 1; i < path.length; i++) curve.add(new T.LineCurve3(surface(path[i - 1].x, path[i - 1].y), surface(path[i].x, path[i].y)));
      root.add(new T.Mesh(new T.TubeGeometry(curve, path.length * 3, thickness, 5, false), core));
      root.add(new T.Mesh(new T.TubeGeometry(curve, path.length * 3, thickness * 3.7, 5, false), halo));
    };
    addBolt(points, .31);
    for (const index of [5, 10, 16]) {
      const start = points[index], side = this.rng() > .5 ? 1 : -1;
      const branch = [start];
      for (let i = 1; i <= 8; i++) branch.push(new T.Vector2(start.x + i * 1.4 + (this.rng() - .5) * 3, start.y + side * i * 2.6 + (this.rng() - .5) * 4));
      addBolt(branch, .16);
    }
    const cloud = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
      uniforms: { intensity: { value: 0 } },
      vertexShader: 'varying vec2 uvCloud;void main(){uvCloud=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 uvCloud;uniform float intensity;
        void main(){vec2 p=(uvCloud-.5)*2.;float mist=.72+.28*sin(p.x*9.+sin(p.y*12.));float a=exp(-dot(p,p)*4.5)*mist*intensity;
        gl_FragColor=vec4(.26,.53,1.,a*.32);}`,
    });
    const glow = new T.Mesh(new T.PlaneGeometry(88, 88), cloud);
    glow.position.copy(normal).multiplyScalar(174.5); glow.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal); root.add(glow);
    return { root, core, halo, cloud, age: 2 };
  }

  private paint(cell: StormCell, energy: number): void {
    cell.root.visible = energy > .004;
    cell.core.opacity = energy * .94;
    cell.halo.opacity = energy * .2;
    cell.cloud.uniforms.intensity.value = energy;
  }

  update(dt: number): void {
    if (this.reducedMotion) return;
    this.untilStrike -= dt;
    if (this.untilStrike <= 0) {
      let index = Math.floor(this.rng() * this.cells.length);
      if (index === this.previous) index = (index + 1) % this.cells.length;
      this.cells[index].age = 0; this.previous = index;
      this.untilStrike = 2.2 + this.rng() * 2;
    }
    for (const cell of this.cells) { cell.age += dt; this.paint(cell, lightningEnvelope(cell.age)); }
  }
}
