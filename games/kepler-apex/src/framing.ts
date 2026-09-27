import * as T from 'three';

export const CAR_BOUNDS:T.Vector3[]=[];
for(const x of [-2.2,2.2])for(const y of [0,2.45])for(const z of [-3.6,3.25])CAR_BOUNDS.push(new T.Vector3(x,y,z));
const projected=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3();

/** Keep the solid car inside the portrait viewport through curve and camera lag. */
export function keepCarInFrame(camera:T.PerspectiveCamera,car:T.Object3D,target:T.Vector3,maxScreenY=.63):void {
  car.updateWorldMatrix(true,false);
  const bottom=1-2*maxScreenY,side=.83;
  for(let i=0;i<6;i++) {
    camera.lookAt(target);camera.updateMatrixWorld();
    let minX=Infinity,maxX=-Infinity,minY=Infinity;
    for(const p of CAR_BOUNDS){projected.copy(p).applyMatrix4(car.matrixWorld).project(camera);minX=Math.min(minX,projected.x);maxX=Math.max(maxX,projected.x);minY=Math.min(minY,projected.y);}
    if(minX>=-side&&maxX<=side&&minY>=bottom)break;
    const distance=camera.position.distanceTo(car.getWorldPosition(projected));
    const scale=Math.tan(T.MathUtils.degToRad(camera.fov/2))*distance;
    right.set(1,0,0).applyQuaternion(camera.quaternion);up.set(0,1,0).applyQuaternion(camera.quaternion);
    if(maxX-minX>side*2){camera.position.addScaledVector(camera.getWorldDirection(projected),-1.5);continue;}
    if(minX < -side || maxX > side)target.addScaledVector(right,(minX+maxX)*.5*scale*camera.aspect);
    if(minY<bottom)target.addScaledVector(up,-(bottom-minY)*scale*1.12);
  }
  camera.lookAt(target);camera.updateMatrixWorld();
}
