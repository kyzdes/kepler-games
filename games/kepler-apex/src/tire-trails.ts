import * as T from 'three';
import { frameAt } from './track.ts';

export class TireTrails {
  private capacity=700;
  private mesh=new T.InstancedMesh(new T.PlaneGeometry(.42,1),new T.MeshBasicMaterial({color:0x05090d,transparent:true,opacity:.52,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),this.capacity);
  private cursor=0;
  private previous:number|null=null;
  private transform=new T.Object3D();
  constructor(scene:T.Scene){this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);}
  reset():void {this.mesh.count=0;this.cursor=0;this.previous=null;}
  update(distance:number,lane:number,heading:number,slip:number,braking:boolean):void {
    if(slip<.32&&!braking){this.previous=null;return;}
    if(this.previous===null){this.previous=distance;return;}
    const travel=distance-this.previous;if(travel<.65)return;
    if(travel>8){this.previous=distance;return;}
    for(const side of [-1,1]) {
      const f=frameAt(distance-1.96-travel/2,lane+side*1.85-Math.sin(heading)*1.96);
      this.transform.position.copy(f.position).addScaledVector(f.up,.052);
      this.transform.quaternion.copy(f.rotation);this.transform.rotateY(-heading);this.transform.rotateX(-Math.PI/2);
      this.transform.scale.set(1,travel+.15,1);this.transform.updateMatrix();
      this.mesh.setMatrixAt(this.cursor,this.transform.matrix);this.cursor=(this.cursor+1)%this.capacity;
      this.mesh.count=Math.min(this.capacity,this.mesh.count+1);
    }
    this.mesh.instanceMatrix.needsUpdate=true;this.previous=distance;
  }
}
