import * as T from 'three';
import { HALF_WIDTH, PADS, wrap } from './rules.ts';
import { createRockGeometry, placeRocks } from './scenery.ts';

const UP = new T.Vector3(0, 1, 0);
export const curve = new T.CatmullRomCurve3([
  [0,0,0], [0,4,-190], [140,18,-340], [355,36,-275], [430,10,-50],
  [265,-6,115], [245,12,340], [0,30,460], [-270,9,360], [-400,-12,140],
  [-340,-2,-65], [-170,8,-80], [-85,3,115], [-36,0,175],
].map(p => new T.Vector3(...p as [number,number,number])), true, 'catmullrom', .45);
curve.arcLengthDivisions = 3000;
export const TRACK_LENGTH = curve.getLength();
export interface Frame { position: T.Vector3; forward: T.Vector3; right: T.Vector3; up: T.Vector3; rotation: T.Quaternion; }
export function frameAt(distance: number, lane = 0): Frame {
  const t = wrap(distance, TRACK_LENGTH) / TRACK_LENGTH;
  const position = curve.getPointAt(t), forward = curve.getTangentAt(t).normalize();
  const right = new T.Vector3().crossVectors(forward, UP).normalize();
  const up = new T.Vector3().crossVectors(right, forward).normalize();
  position.addScaledVector(right, lane);
  const rotation = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right, up, forward.clone().negate()));
  return { position, forward, right, up, rotation };
}
export function curvatureAt(distance: number): number {
  const a = curve.getTangentAt(wrap(distance - 4, TRACK_LENGTH) / TRACK_LENGTH);
  const b = curve.getTangentAt(wrap(distance + 4, TRACK_LENGTH) / TRACK_LENGTH);
  return (a.z * b.x - a.x * b.z) / 8;
}
function ribbon(offset: number, width: number, height: number): T.BufferGeometry {
  const positions:number[] = [], normals:number[] = [], uvs:number[] = [], indices:number[] = [];
  const segments = 1000;
  for (let i=0;i<=segments;i++) {
    const f = frameAt(i / segments * TRACK_LENGTH);
    for (const side of [-1,1]) {
      const p = f.position.clone().addScaledVector(f.right, offset + side * width / 2).addScaledVector(f.up, height);
      positions.push(p.x,p.y,p.z); normals.push(f.up.x,f.up.y,f.up.z); uvs.push((side+1)/2,i*.45);
    }
    if (i<segments) { const k=i*2; indices.push(k,k+1,k+2,k+1,k+3,k+2); }
  }
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3)); geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  return geometry;
}
export function createTrack(scene: T.Scene, stone: T.Texture): void {
  const steel = new T.MeshStandardMaterial({color:0x253744,metalness:.38,roughness:.86});
  const edge = new T.MeshStandardMaterial({color:0x718794,metalness:.7,roughness:.35});
  const stripe = new T.MeshStandardMaterial({color:0xe6cba2,roughness:.55,metalness:.4});
  const ice = new T.MeshStandardMaterial({color:0xa4d5eb,emissive:0x65badd,emissiveIntensity:.85,roughness:.3});
  const gold = new T.MeshStandardMaterial({color:0xd99758,emissive:0xb75b23,emissiveIntensity:.4,metalness:.5,roughness:.5});
  const dark = new T.MeshStandardMaterial({color:0x0c1a24,metalness:.7,roughness:.65});
  function add(geo:T.BufferGeometry,mat:T.Material) { const m=new T.Mesh(geo,mat); m.receiveShadow=true;scene.add(m);return m; }
  add(ribbon(0,HALF_WIDTH*2,0),steel);
  add(ribbon(0,HALF_WIDTH*2+1.6,-1.1),dark);
  for(const side of [-1,1]) {
    add(ribbon(side*12.1,.2,.035),stripe);
    add(ribbon(side*13.45,1.25,.18),edge);
    add(ribbon(side*13.1,.16,.85),ice);
    const points=Array.from({length:650},(_,i)=>{const f=frameAt(i/649*TRACK_LENGTH,side*13.5);return f.position.addScaledVector(f.up,.5);});
    const railCurve=new T.CatmullRomCurve3(points,false); add(new T.TubeGeometry(railCurve,650,.35,5,false),edge);
  }
  const temp=new T.Object3D();
  function repeat(geometry:T.BufferGeometry,material:T.Material,items:{distance:number;lane:number;height:number;scale?:T.Vector3}[]) {
    const mesh=new T.InstancedMesh(geometry,material,items.length);
    items.forEach((item,i)=>{const f=frameAt(item.distance,item.lane);temp.position.copy(f.position).addScaledVector(f.up,item.height);temp.quaternion.copy(f.rotation);temp.scale.copy(item.scale??new T.Vector3(1,1,1));temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);});
    scene.add(mesh);return mesh;
  }
  const laneMarks=[], joints=[], supports=[], curbs=[], lights=[];
  for(let d=0;d<TRACK_LENGTH;d+=15) {
    for(const lane of [-4.35,4.35])laneMarks.push({distance:d,lane,height:.035});
    joints.push({distance:d,lane:0,height:.012});
    for(const side of [-1,1]) {curbs.push({distance:d,lane:side*12.65,height:.06});lights.push({distance:d,lane:side*13.8,height:.72});}
    if(Math.round(d)%45===0)for(const side of [-1,1])supports.push({distance:d,lane:side*13.5,height:-1.35});
  }
  repeat(new T.BoxGeometry(.12,.03,3.8),stripe,laneMarks);
  repeat(new T.BoxGeometry(25.7,.014,.07),dark,joints);
  repeat(new T.BoxGeometry(.6,.045,6),gold,curbs);
  repeat(new T.BoxGeometry(.4,.18,.9),ice,lights);
  repeat(new T.BoxGeometry(.75,3.3,.8),edge,supports);
  // Physical ribs under the circuit make it read as built infrastructure.
  for(let d=0;d<TRACK_LENGTH;d+=110) {
    const f=frameAt(d); const root=new T.Group();root.position.copy(f.position);root.quaternion.copy(f.rotation);scene.add(root);
    const rib=new T.Mesh(new T.BoxGeometry(28,1.3,2.5),dark);rib.position.y=-1.6;root.add(rib);
    for(const side of [-1,1]) {const brace=new T.Mesh(new T.BoxGeometry(14,.55,1.25),edge);brace.position.set(side*6.8,-4.1,0);brace.rotation.z=side*.3;root.add(brace);}
  }
  // Gates show the direction and bring scale to the skyline.
  for(const [i,d] of [0,TRACK_LENGTH*.24,TRACK_LENGTH*.51,TRACK_LENGTH*.77].entries()) {
    const f=frameAt(d);const root=new T.Group();root.position.copy(f.position);root.quaternion.copy(f.rotation);scene.add(root);
    for(const side of [-1,1]) {
      const pillar=new T.Mesh(new T.BoxGeometry(1.05,11.5,1.2),edge);pillar.position.set(side*14.7,5.1,0);root.add(pillar);
      const band=new T.Mesh(new T.BoxGeometry(.16,9,.15),i===0?gold:ice);band.position.set(side*14.05,5.4,.7);root.add(band);
    }
    const top=new T.Mesh(new T.BoxGeometry(30.4,1.35,1.6),dark);top.position.y=11;root.add(top);
    for(let k=0;k<5;k++){const lamp=new T.Mesh(new T.BoxGeometry(1.2,.25,.18),i===0?gold:ice);lamp.position.set((k-2)*2.3,10.9,.85);root.add(lamp);}
  }
  const checkerWhite=new T.MeshStandardMaterial({color:0xc9d9e1,roughness:.8});
  const squares=[];for(let row=0;row<2;row++)for(let col=0;col<16;col++)if((row+col)%2===0)squares.push({distance:row*1.4,lane:-12.2+col*1.62,height:.045});
  repeat(new T.BoxGeometry(1.6,.035,1.4),checkerWhite,squares);
  for(const pad of PADS) {
    const f=frameAt(pad.fraction*TRACK_LENGTH,pad.lane);const root=new T.Group();root.position.copy(f.position);root.quaternion.copy(f.rotation);scene.add(root);
    const plate=new T.Mesh(new T.BoxGeometry(6.4,.07,12),dark);plate.position.y=.07;root.add(plate);
    for(let i=0;i<5;i++)for(const side of [-1,1]) {
      const mark=new T.Mesh(new T.BoxGeometry(2.9,.08,.42),ice);mark.position.set(side*1.2,.14,(i-2)*2);mark.rotation.y=side*-.4;root.add(mark);
    }
  }
  const rockGeo=createRockGeometry();
  const rockMat=new T.MeshStandardMaterial({color:0x526471,map:stone,bumpMap:stone,bumpScale:1.8,roughness:1});
  for(const placement of placeRocks(TRACK_LENGTH,frameAt,rockGeo.boundingSphere!.radius+rockGeo.boundingSphere!.center.length())){
    const rock=new T.Mesh(rockGeo,rockMat);rock.position.copy(placement.position);rock.scale.copy(placement.scale);rock.rotation.copy(placement.rotation);scene.add(rock);
  }
}
