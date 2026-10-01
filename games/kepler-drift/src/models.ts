import * as T from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mulberry32 } from './state.ts';

const white = new T.MeshStandardMaterial({ color: 0xc8d4dc, metalness: 0.62, roughness: 0.36 });
const orange = new T.MeshStandardMaterial({ color: 0xbf5625, metalness: 0.5, roughness: 0.38 });
const dark = new T.MeshStandardMaterial({ color: 0x141c23, metalness: 0.78, roughness: 0.4 });
const metal = new T.MeshStandardMaterial({ color: 0x53616c, metalness: 0.9, roughness: 0.27 });
const glass = new T.MeshPhysicalMaterial({ color: 0x0c2435, metalness: 0.83, roughness: 0.12, clearcoat: 1 });
const cyan = new T.MeshStandardMaterial({ color: 0x98dfff, emissive: 0x58c8ff, emissiveIntensity: 1.7, roughness: 0.3 });
const gold = new T.MeshStandardMaterial({ color: 0xffb63d, emissive: 0xe9770b, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.24 });

function mesh(geo: T.BufferGeometry, mat: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0): T.Mesh {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent: T.Object3D, mat: T.Material, size: [number, number, number], pos: [number, number, number]): T.Mesh {
  return mesh(new T.BoxGeometry(...size), mat, parent, ...pos);
}
function cylinder(parent: T.Object3D, mat: T.Material, radius: number, length: number, x: number, y: number, z: number, radius2 = radius): T.Mesh {
  const m = mesh(new T.CylinderGeometry(radius, radius2, length, 24), mat, parent, x, y, z); m.rotation.x = Math.PI / 2; return m;
}
function panel(parent: T.Object3D, points: number[][], mat: T.Material, y: number, thickness = 0.1): T.Mesh {
  const s = new T.Shape(); points.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.04, bevelSegments: 2, steps: 1 });
  const m = mesh(g, mat, parent); m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
}

export interface ShipModel { root: T.Group; flames: T.Mesh[]; engineLights: T.PointLight[]; muzzles: T.Object3D[]; }
export function createShip(): ShipModel {
  const root = new T.Group(); root.name = 'Кеплер — разведывательный добывающий корабль';
  // Eight-sided, tapered cross-sections create an original hard-surface fuselage.
  const sections = [[-3.6, 0.2, 0.16], [-2.6, 0.56, 0.36], [-1.2, 0.86, 0.52], [1.5, 0.91, 0.57], [2.45, 0.64, 0.45]];
  const vertices: number[] = [], idx: number[] = [];
  for (const [z, w, h] of sections) for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 + Math.PI / 8; vertices.push(Math.cos(a) * w, Math.sin(a) * h, z); }
  for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 8; j++) { const a = i * 8 + j, b = i * 8 + (j + 1) % 8, c = a + 8, d = b + 8; idx.push(a, c, b, b, c, d); }
  for (const end of [0, sections.length - 1]) for (let j = 1; j < 7; j++) idx.push(end * 8, end * 8 + (end === 0 ? j : j + 1), end * 8 + (end === 0 ? j + 1 : j));
  const hull = new T.BufferGeometry(); hull.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); hull.setIndex(idx); hull.computeVertexNormals(); mesh(hull, white, root);
  panel(root, [[-.25,-3.45],[.25,-3.45],[.34,2.1],[-.34,2.1]], orange, .5, .07);
  box(root, dark, [1.24, .32, 2.7], [0,-.4,.6]);
  // Inset cockpit, dorsal frame and rear mechanical vents.
  const cockpit = mesh(new T.SphereGeometry(1, 20, 12), glass, root, 0, .63, -.7); cockpit.scale.set(.57, .38, 1.1);
  panel(root, [[-.62,-1.55],[-.45,-1.85],[-.45,.35],[-.68,.2]], white, .58, .08);
  panel(root, [[.62,-1.55],[.45,-1.85],[.45,.35],[.68,.2]], white, .58, .08);
  box(root, orange, [.1,.06,1.7],[0,.96,-.6]);
  for(let i=0;i<7;i++) box(root, metal, [.8,.055,.08],[0,.6,.65+i*.2]);
  box(root, dark, [.9,.63,.3],[0,0,2.45]);
  for(let i=0;i<5;i++) box(root, metal, [.62,.055,.05],[0,-.2+i*.1,2.62]);
  const flames: T.Mesh[] = [], engineLights: T.PointLight[] = [], muzzles: T.Object3D[] = [];
  for(const side of [-1,1]) {
    const x = side * 1.67;
    const points = [[side*.67,-1.95],[side*1.6,-1.15],[side*4.1,1.68],[side*3.95,2.42],[side*.76,1.65]];
    panel(root,points,dark,-.12,.21);
    panel(root,points.map(([a,b])=>[a*.97,b*.93]),white,.13,.12);
    panel(root,[[side*2.85,.58],[side*3.85,1.7],[side*3.74,2.12],[side*2.66,.92]],orange,.28,.035);
    for(let i=0;i<4;i++) {
      const line=box(root,dark,[.042,.026,1.04],[side*(2.3+i*.29),.3,1.32+i*.18]); line.rotation.y=side*-.5;
    }
    cylinder(root,dark,.63,3.9,x,.04,.43);
    cylinder(root,white,.69,2.6,x,.13,-.32,.59);
    cylinder(root,metal,.68,.85,x,.04,1.86,.59);
    cylinder(root,dark,.57,.4,x,.04,2.45);
    for(const z of [-1.42,-.82,.33,1.28,1.75,2.2,2.48]) mesh(new T.TorusGeometry(z>1.3?.65:.7,.055,6,32),metal,root,x,.04,z);
    for(let i=0;i<8;i++) { const a=i*Math.PI/4; const fin=box(root,metal,[.07,.1,.55],[x+Math.cos(a)*.61,.04+Math.sin(a)*.61,1.83]); fin.rotation.z=a; }
    cylinder(root,orange,.695,.31,x,.13,-.42);
    cylinder(root,cyan,.47,.04,x,.04,2.69);
    mesh(new T.TorusGeometry(.5,.052,8,32),white,root,x,.04,2.68);
    const core=cylinder(root,cyan,.17,.06,x,.04,2.74); core.castShadow=false;
    const flameMat=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv; void main(){float a=pow(1.-vUv.y,2.2);float c=pow(abs(sin(vUv.x*6.28318)),1.2);gl_FragColor=vec4(mix(vec3(.13,.43,1.),vec3(.58,.91,1.),a),a*.32*(.4+c*.6));}' });
    const flame=mesh(new T.ConeGeometry(.45,3.5,24,1,true),flameMat,root,x,.04,4.4); flame.rotation.x=Math.PI/2; flame.castShadow=false; flames.push(flame);
    const light=new T.PointLight(0x5fcfff,1.6,5,2); light.position.set(x,.2,3.4); root.add(light); engineLights.push(light);
    // Separate forward cannons with cooling jackets and emissive aperture.
    const gunX=side*1.04;
    box(root,dark,[.32,.28,1.5],[gunX,.3,-1.95]);
    cylinder(root,metal,.11,1.75,gunX,.43,-2.76);
    for(let i=0;i<4;i++) cylinder(root,dark,.17,.12,gunX,.43,-2.1-i*.25);
    cylinder(root,orange,.18,.16,gunX,.43,-3.56);
    const muzzle=new T.Object3D(); muzzle.position.set(gunX,.43,-3.7); root.add(muzzle); muzzles.push(muzzle);
    const wingLamp=box(root,cyan,[.18,.04,.36],[side*3.91,.3,1.9]); wingLamp.castShadow=false;
    for(let i=0;i<5;i++) for(const z of [-1.2,1.3]) box(root,metal,[.055,.04,.065],[side*(.48+i*.19),.54,z]);
    const tail = panel(root,[[side*.76,.85],[side*1.04,1.1],[side*.88,2.5],[side*.62,2.25]],white,.54,.12); tail.rotation.z=side*.45;
  }
  root.scale.setScalar(1.04);
  return {root,flames,engineLights,muzzles};
}

const simplex = new SimplexNoise({random:mulberry32(937)});
export function noise3(x: number, y: number, z: number): number {
  return simplex.noise3d(x,y,z)*.64 + simplex.noise3d(x*2.15+11,y*2.15,z*2.15)*.25 + simplex.noise3d(x*5.1,y*5.1+7,z*5.1)*.11;
}
export function rockGeometry(seed: number): T.BufferGeometry {
  let g:T.BufferGeometry=new T.IcosahedronGeometry(1,13); const p=g.attributes.position, colors:number[]=[];
  const rng=mulberry32(seed), sx=.75+rng()*.45, sy=.7+rng()*.55, sz=.85+rng()*.45, off=rng()*40;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i); const n=noise3(x*1.6+off,y*1.6,z*1.6);
    const r=1+n*.32+noise3(x*3.5,y*3.5+off,z*3.5)*.1;
    p.setXYZ(i,x*r*sx,y*r*sy,z*r*sz);
    const c=.62+n*.22; colors.push(c*.87,c*.94,c);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  g.deleteAttribute('normal'); g=mergeVertices(g,.0001); g.computeVertexNormals(); return g;
}
const crystalGeometry = new T.OctahedronGeometry(1,0);
export function crystal(material: T.Material = gold): T.Mesh { return new T.Mesh(crystalGeometry,material); }
export function createRock(geometry: T.BufferGeometry, material: T.Material, radius: number, ore: boolean, seed: number): T.Group {
  const root=new T.Group(); root.scale.setScalar(radius); const m=mesh(geometry,material,root); m.castShadow=false;
  if(ore) {
    const rng=mulberry32(seed);
    for(let i=0;i<5;i++) {
      const direction=new T.Vector3(rng()*2-1,rng()*2-1,.5+rng()).normalize();
      const c=crystal();c.position.copy(direction).multiplyScalar(.86);c.scale.set(.09+rng()*.08,.18+rng()*.25,.1+rng()*.08);c.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);root.add(c);
      const seam=mesh(new T.BoxGeometry(.028,.03,.52),gold,root,...c.position.toArray() as [number,number,number]); seam.rotation.set(rng()*3,rng()*3,rng()*3);
    }
  }
  return root;
}
