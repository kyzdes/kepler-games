import * as T from 'three';
import { HALF_WIDTH, mulberry32 } from './rules.ts';

export const SCENERY_CLEARANCE = HALF_WIDTH + 10;
export interface RockPlacement { position:T.Vector3; scale:T.Vector3; rotation:T.Euler; radius:number; }
export function distanceToCircuit(point:T.Vector3, circuit:T.Vector3[]):number {
  let minimum=Infinity;
  for(let i=1;i<circuit.length;i++) {
    const a=circuit[i-1],b=circuit[i],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy+(point.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz||1)));
    minimum=Math.min(minimum,(point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2+(point.z-a.z-t*dz)**2);
  }
  return Math.sqrt(minimum);
}
export function createRockGeometry():T.BufferGeometry {
  const geometry=new T.IcosahedronGeometry(1,3),pos=geometry.attributes.position;
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),r=1+Math.sin(x*7.7+y*3)*Math.cos(z*6.1)*.14;
    pos.setXYZ(i,x*r,y*r,z*r);
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function placeRocks(length:number,frameAt:(distance:number,lane?:number)=>{position:T.Vector3},geometryRadius:number,seed=1792,count=115):RockPlacement[] {
  const rng=mulberry32(seed),rocks:RockPlacement[]=[];
  // Test the full swept circuit, including nearby bends, against each entire rock.
  // The extra clearance also covers railings, gates and polyline approximation.
  const circuit=Array.from({length:2049},(_,i)=>frameAt(i/2048*length).position);
  for(let attempt=0;rocks.length<count&&attempt<count*100;attempt++) {
    const position=frameAt(rng()*length,(rng()>.5?1:-1)*(38+rng()*180)).position;
    position.y+=-55+rng()*145;
    const size=3+rng()*23,scale=new T.Vector3(size,size*(.6+rng()*.65),size*(.7+rng()*.6));
    const rotation=new T.Euler(rng()*6,rng()*6,rng()*6);
    const radius=geometryRadius*Math.max(scale.x,scale.y,scale.z);
    if(distanceToCircuit(position,circuit)<radius+SCENERY_CLEARANCE)continue;
    rocks.push({position,scale,rotation,radius});
  }
  return rocks;
}
