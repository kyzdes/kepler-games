import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mulberry32 } from './rules';

export function createEnvironment(scene: T.Scene, renderer: T.WebGLRenderer, ice: T.Texture): T.Group {
  scene.background = new T.Color(0x020811);
  scene.fog = new T.FogExp2(0x07131e, .00065);
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .04); scene.environment = env.texture; scene.environmentIntensity = .22;
  room.dispose(); pmrem.dispose();
  scene.add(new T.HemisphereLight(0x87b8ed, 0x111b2a, 1.05));
  const sun = new T.DirectionalLight(0xdaeeff, 2.4); sun.position.set(-35,40,18); scene.add(sun);
  const rim = new T.DirectionalLight(0x85bfff, 1.3); rim.position.set(12,8,-25); scene.add(rim);
  const fill = new T.DirectionalLight(0xffc291, .5); fill.position.set(15,-5,15); scene.add(fill);
  const cosmos = new T.Group(); scene.add(cosmos);
  // A sparse star field at several distances gives authentic parallax.
  const rng=mulberry32(18263), stars:number[]=[], colors:number[]=[], color=new T.Color();
  for(let i=0;i<6100;i++) {
    const a=rng()*Math.PI*2, b=Math.acos(2*rng()-1),r=850+rng()*150;
    stars.push(Math.sin(b)*Math.cos(a)*r,Math.cos(b)*r,Math.sin(b)*Math.sin(a)*r);
    color.setHSL(.57+rng()*.12,.12+rng()*.32,.5+rng()*.45); colors.push(color.r,color.g,color.b);
  }
  const sg=new T.BufferGeometry(); sg.setAttribute('position',new T.Float32BufferAttribute(stars,3));sg.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  cosmos.add(new T.Points(sg,new T.PointsMaterial({size:2.15,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.88,fog:false})));
  // Analytic nebula on the distant sphere: it stays behind actual geometry.
  const nebula=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 vDir;
    float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.09+vec3(11.3,7.1,3.8);a*=.5;}return v;}
    void main(){vec3 d=normalize(vDir);float band=pow(max(0.,1.-abs(d.y-.4*d.x-.12)*1.7),4.);float n=fbm(d*5.+vec3(7,3,11));float n2=fbm(d*15.+n*2.);float light=pow(n*n2,1.4)*band;vec3 c=vec3(.018,.035,.055)+light*vec3(.1,.24,.36);gl_FragColor=vec4(c,1.);}`
  });
  const sky=new T.Mesh(new T.SphereGeometry(1150,32,16),nebula); sky.renderOrder=-3;cosmos.add(sky);

  const planetGroup=new T.Group();planetGroup.position.set(-300,185,-670);cosmos.add(planetGroup);
  const iceRoughness=ice.clone(); iceRoughness.colorSpace=T.NoColorSpace; iceRoughness.needsUpdate=true;
  const planet=new T.Mesh(new T.SphereGeometry(172,96,64),new T.MeshStandardMaterial({map:ice,bumpMap:ice,bumpScale:.65,roughnessMap:iceRoughness,color:0xa8cde8,roughness:.85,metalness:.06}));
  planet.rotation.z=.22;planet.rotation.y=1.1;planetGroup.add(planet);
  const atmosphere=new T.Mesh(new T.SphereGeometry(177,64,48),new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.BackSide,
    vertexShader:'varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 vNormal;varying vec3 vView;void main(){float f=pow(max(0.,1.-abs(dot(normalize(vNormal),normalize(vView)))),3.5);gl_FragColor=vec4(.36,.65,1.,f*.65);}'
  }));planetGroup.add(atmosphere);
  const ringMat=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,
    vertexShader:'varying vec3 localP;void main(){localP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 localP;void main(){float r=length(localP.xy);float n=sin(r*2.9)*.1+sin(r*1.07)*.2+sin(r*.26)*.23;float a=.24+n;float gap=smoothstep(257.,259.,r)*(1.-smoothstep(267.,270.,r));a*=1.-gap*.92;float edge=smoothstep(201.,210.,r)*(1.-smoothstep(321.,338.,r));vec3 c=mix(vec3(.22,.31,.39),vec3(.68,.8,.87),a);gl_FragColor=vec4(c,max(0.,a)*edge*.78);}`
  });
  const rings=new T.Mesh(new T.RingGeometry(202,338,160,1),ringMat);
  rings.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(-.25,.88,.4).normalize());planetGroup.add(rings);
  return cosmos;
}
