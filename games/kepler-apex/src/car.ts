import * as T from 'three';

export interface Car { root:T.Group; body:T.Group; wheels:T.Group[]; frontWheels:T.Group[]; flames:T.Mesh[]; tail:T.MeshStandardMaterial; }
export function createCar(accent=0xbf5625):Car {
  const root=new T.Group(), body=new T.Group();root.add(body);
  const ceramic=new T.MeshStandardMaterial({color:0xcbd6dc,metalness:.48,roughness:.43});
  const orange=new T.MeshStandardMaterial({color:accent,metalness:.56,roughness:.36});
  const carbon=new T.MeshStandardMaterial({color:0x111b22,metalness:.6,roughness:.48});
  const metal=new T.MeshStandardMaterial({color:0x687f8c,metalness:.9,roughness:.28});
  const glass=new T.MeshPhysicalMaterial({color:0x102c3f,metalness:.86,roughness:.12,clearcoat:1});
  const cyan=new T.MeshStandardMaterial({color:0xafe9ff,emissive:0x63cfff,emissiveIntensity:2.2});
  const tail=new T.MeshStandardMaterial({color:0xff7950,emissive:0xff4020,emissiveIntensity:1.4});
  function mesh(geo:T.BufferGeometry,mat:T.Material,x=0,y=0,z=0,parent:T.Object3D=body){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;}
  function box(mat:T.Material,w:number,h:number,d:number,x:number,y:number,z:number){return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z);}
  function panel(points:number[][],mat:T.Material,y:number,depth=.1) {
    const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const m=mesh(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.06,bevelThickness:.05,bevelSegments:2,steps:1}),mat,0,y,0);m.rotation.x=-Math.PI/2;return m;
  }
  // A low, wide endurance prototype: ceramic monocoque, exposed wheels and twin thrusters.
  panel([[-.65,-3.5],[.65,-3.5],[1.48,-1.9],[1.46,2.4],[.97,3.15],[-.97,3.15],[-1.46,2.4],[-1.48,-1.9]],carbon,.55,.42);
  panel([[-.56,-3.35],[.56,-3.35],[1.22,-1.7],[1.27,2.35],[.8,2.85],[-.8,2.85],[-1.27,2.35],[-1.22,-1.7]],ceramic,1,.22);
  panel([[-.15,-3.4],[.3,-3.4],[.46,2.7],[.03,2.7]],orange,1.29,.035);
  const canopy=mesh(new T.SphereGeometry(1,28,14),glass,0,1.46,.05);canopy.scale.set(.85,.64,1.65);
  const spine=box(ceramic,.09,.1,2.75,0,2.03,.05);spine.rotation.x=.015;
  box(carbon,2.9,.14,.75,0,.53,-3.18);
  box(orange,2.6,.13,.25,0,.7,-3.48);
  box(carbon,3.7,.17,.86,0,1.94,2.74);
  box(orange,3.85,.06,.3,0,2.04,2.48);
  for(const side of [-1,1]) {
    box(metal,.12,.95,.23,side*.96,1.5,2.68);
    box(ceramic,.12,.55,.85,side*1.86,2.07,2.78);
    panel([[side*1.04,-2.75],[side*1.97,-2.42],[side*2.08,-.9],[side*1.21,-.6]],ceramic,1.02,.13);
    panel([[side*1.1,.95],[side*2.08,1.28],[side*2.04,2.65],[side*1.16,2.5]],ceramic,1.07,.2);
    box(orange,.57,.035,1.1,side*1.6,1.27,1.94);
    box(cyan,.62,.09,.09,side*1.41,1.16,-2.71);
    box(tail,.9,.08,.09,side*.8,1.1,2.93);
    box(carbon,.32,.58,2.05,side*1.48,.76,.15);
    for(let j=0;j<6;j++)box(metal,.3,.045,.08,side*1.5,1.09,-.46+j*.2);
    for(const z of [-2.5,1.72])for(let j=0;j<3;j++)box(carbon,.055,.025,.33,side*(1.38+j*.15),1.22,z);
  }
  const wheels:T.Group[]=[],frontWheels:T.Group[]=[];
  const tire=new T.MeshStandardMaterial({color:0x0b1218,roughness:.92,metalness:.15});
  for(const side of [-1,1])for(const z of [-1.96,1.96]) {
    const pivot=new T.Group();pivot.position.set(side*1.85,.67,z);body.add(pivot);if(z<0)frontWheels.push(pivot);
    const wheel=new T.Group();pivot.add(wheel);wheels.push(wheel);
    const rubber=mesh(new T.CylinderGeometry(.68,.68,.48,24),tire,0,0,0,wheel);rubber.rotation.z=Math.PI/2;
    const hub=mesh(new T.CylinderGeometry(.45,.45,.5,16),metal,0,0,0,wheel);hub.rotation.z=Math.PI/2;
    const ring=mesh(new T.TorusGeometry(.36,.037,6,24),cyan,side*.265,0,0,wheel);ring.rotation.y=Math.PI/2;
    const center=mesh(new T.CylinderGeometry(.14,.14,.54,8),orange,0,0,0,wheel);center.rotation.z=Math.PI/2;
    for(let i=0;i<6;i++) {const a=i*Math.PI/3;const spoke=mesh(new T.BoxGeometry(.04,.62,.065),carbon,side*.26,0,0,wheel);spoke.rotation.x=a;}
  }
  const flames:T.Mesh[]=[];
  for(const side of [-1,1]) {
    const x=side*.75;
    const housing=mesh(new T.CylinderGeometry(.3,.36,.85,20),metal,x,.7,2.73);housing.rotation.x=Math.PI/2;
    mesh(new T.CircleGeometry(.25,20),cyan,x,.7,3.17);
    mesh(new T.TorusGeometry(.3,.06,8,24),carbon,x,.7,3.2);
    const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;void main(){float a=pow(1.-vUv.y,1.7);gl_FragColor=vec4(mix(vec3(.07,.35,1.),vec3(.66,.91,1.),a),a*.65);}'
    });
    const flame=mesh(new T.ConeGeometry(.25,2,20,1,true),mat,x,.7,4.17);flame.rotation.x=Math.PI/2;flames.push(flame);
  }
  const shadow=new T.Mesh(new T.PlaneGeometry(4.4,7.5),new T.ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float a=pow(max(0.,1.-dot(p,p)),.55);gl_FragColor=vec4(0.,.015,.023,a*.65);}'
  }));shadow.rotation.x=-Math.PI/2;shadow.position.y=.08;root.add(shadow);
  return {root,body,wheels,frontWheels,flames,tail};
}
