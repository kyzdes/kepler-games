import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { keepCarInFrame, CAR_BOUNDS } from '../src/framing.ts';
import { frameAt, TRACK_LENGTH } from '../src/track.ts';

test('whole car stays inside the portrait viewport above instruments on every bend and both rails',()=>{
  for(const [width,height] of [[390,844],[390,660],[320,740]])for(const lane of [-10.9,0,10.9])for(let sample=0;sample<90;sample++){
    const distance=sample/90*TRACK_LENGTH,now=frameAt(distance,lane),previous=frameAt(distance-13,lane);
    const root=new T.Group();root.position.copy(now.position).addScaledVector(now.up,.12);root.quaternion.copy(now.rotation);
    const car=new T.Group();root.add(car);car.rotation.set(.075,.5,.14);
    const camera=new T.PerspectiveCamera(70,width/height,.15,2000);
    camera.position.copy(previous.position).addScaledVector(previous.forward,-17.4).addScaledVector(previous.up,8.5);
    const target=previous.position.clone().addScaledVector(previous.forward,10).addScaledVector(previous.up,1.3);
    const maxY=Math.min(.63,1-310/height);
    keepCarInFrame(camera,car,target,maxY);
    for(const corner of CAR_BOUNDS){
      const p=corner.clone().applyMatrix4(car.matrixWorld).project(camera);
      assert.ok(Math.abs(p.x)<=.855,`horizontal clipping: ${width}x${height}, lane ${lane}, section ${sample}: ${p.x}`);
      assert.ok((1-p.y)/2<=maxY+.008,`car overlaps instruments: ${width}x${height}, section ${sample}`);
    }
  }
});
