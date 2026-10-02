import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mulberry32 } from './state';
import { PlanetStorm } from './storm';
import { sectorVisual, SECTOR_VISUALS } from './sectors';
import { QuietSkyShader } from './quiet-sky';

export interface SpaceEnvironment { root: T.Group; update(dt: number): void; setSector(sector: number): void; }

export function createEnvironment(scene: T.Scene, renderer: T.WebGLRenderer, textures: ReadonlyMap<string, T.Texture>, reducedMotion = false): SpaceEnvironment {
  scene.background = new T.Color(0x020811);
  const fog = new T.FogExp2(0x030b17, .00055); scene.fog = fog;
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, .04); scene.environment = env.texture; scene.environmentIntensity = .32;
  room.dispose(); pmrem.dispose();
  const ambient = new T.HemisphereLight(0x87b8ed, 0x111b2a, 1.15); scene.add(ambient);
  const sun = new T.DirectionalLight(0xdaeeff, 3.1); sun.position.set(-35,40,18); scene.add(sun);
  const rim = new T.DirectionalLight(0x85bfff, 2); rim.position.set(12,8,-25); scene.add(rim);
  const fill = new T.DirectionalLight(0xffc291, .5); fill.position.set(15,-5,15); scene.add(fill);
  const cosmos = new T.Group(); cosmos.name = 'Орбитальное окружение'; scene.add(cosmos);
  // A sparse star field at several distances gives authentic parallax.
  const rng=mulberry32(18263), stars:number[]=[], colors:number[]=[], color=new T.Color();
  for(let i=0;i<6100;i++) {
    const a=rng()*Math.PI*2, b=Math.acos(2*rng()-1),r=850+rng()*150;
    stars.push(Math.sin(b)*Math.cos(a)*r,Math.cos(b)*r,Math.sin(b)*Math.sin(a)*r);
    color.setHSL(.57+rng()*.12,.12+rng()*.32,.5+rng()*.45); colors.push(color.r,color.g,color.b);
  }
  const sg=new T.BufferGeometry(); sg.setAttribute('position',new T.Float32BufferAttribute(stars,3));sg.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const starField = new T.Points(sg,new T.PointsMaterial({size:1.65,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.6,fog:false}));
  cosmos.add(starField);
  const first = sectorVisual(1), ice = textures.get(first.planet)!;
  for (let sector = 1; sector <= SECTOR_VISUALS.length; sector++) {
    const url=sectorVisual(sector).sky;
    if(!url) continue;
    const panorama = textures.get(url)!;
    // Keep the illustrated galaxies distant and crisp within the playable
    // field of view rather than stretching a small crop over the whole screen.
    panorama.wrapS = panorama.wrapT = T.RepeatWrapping;
    panorama.repeat.set(-2.6, 1.65); panorama.offset.set(.45, -.25);
    panorama.needsUpdate = true;
  }
  // The panorama is on the distant sphere, behind the independently lit planet,
  // rocks and ship. Swapping preloaded maps never replaces the playable 3D scene.
  const nebula = new T.MeshBasicMaterial({map:textures.get(sectorVisual(2).sky!)!,color:new T.Color().setScalar(.55),side:T.BackSide,depthWrite:false,fog:false,toneMapped:false});
  const quietSky=new T.ShaderMaterial({...QuietSkyShader,side:T.BackSide,depthWrite:false});
  const sky=new T.Mesh<T.SphereGeometry,T.Material>(new T.SphereGeometry(1150,64,48),quietSky); sky.name='Панорама сектора'; sky.renderOrder=-3;cosmos.add(sky);

  const planetGroup=new T.Group();planetGroup.position.set(-235,45,-590);cosmos.add(planetGroup);
  const planetMaterial = new T.MeshStandardMaterial({map:ice,bumpMap:ice,emissiveMap:ice,emissive:0xffffff,emissiveIntensity:0,bumpScale:.65,color:0x9cdeff,roughness:.85,metalness:.06,fog:false});
  const planet=new T.Mesh(new T.SphereGeometry(172,96,64),planetMaterial); planet.name='Планета сектора';
  planet.rotation.z=.22;planet.rotation.y=1.1;planetGroup.add(planet);
  const storms = new PlanetStorm(reducedMotion); planetGroup.add(storms.root);
  const atmosphere=new T.Mesh(new T.SphereGeometry(177,64,48),new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.BackSide,
    uniforms:{tint:{value:new T.Color(first.atmosphere)}},
    vertexShader:'varying vec3 vNormal;varying vec3 vView;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 vNormal;varying vec3 vView;uniform vec3 tint;void main(){float f=pow(max(0.,1.-abs(dot(normalize(vNormal),normalize(vView)))),3.5);gl_FragColor=vec4(tint,f*.65);}'
  }));planetGroup.add(atmosphere);
  const ringMat=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,
    uniforms:{tint:{value:new T.Color(first.ring)}},
    vertexShader:'varying vec3 localP;void main(){localP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 localP;uniform vec3 tint;void main(){float r=length(localP.xy);float n=sin(r*2.9)*.1+sin(r*1.07)*.2+sin(r*.26)*.23;float a=.24+n;float gap=smoothstep(257.,259.,r)*(1.-smoothstep(267.,270.,r));a*=1.-gap*.92;float edge=smoothstep(201.,210.,r)*(1.-smoothstep(321.,338.,r));vec3 c=tint*mix(.35,1.2,a);gl_FragColor=vec4(c,max(0.,a)*edge*.78);}`
  });
  const rings=new T.Mesh(new T.RingGeometry(202,338,160,1),ringMat);
  rings.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(-.25,.88,.4).normalize());planetGroup.add(rings);
  const setSector = (sector: number): void => {
    const visual=sectorVisual(sector);
    planetMaterial.map=textures.get(visual.planet)!; planetMaterial.bumpMap=planetMaterial.map; planetMaterial.emissiveMap=planetMaterial.map;
    planetMaterial.color.setHex(visual.planetTint); planetMaterial.bumpScale=visual.bump; planetMaterial.emissiveIntensity=visual.emission;
    planet.rotation.y=visual.planetRotation ?? 1.1;
    nebula.color.setHex(visual.planetTint).multiplyScalar(.55);
    if(visual.sky) nebula.map=textures.get(visual.sky)!;
    sky.material=visual.sky ? nebula : quietSky; sky.rotation.set(...visual.skyRotation);
    starField.material.size=visual.sky ? 1.65 : 2.15; starField.material.opacity=visual.sky ? .6 : .88;
    atmosphere.material.uniforms.tint.value.setHex(visual.atmosphere); ringMat.uniforms.tint.value.setHex(visual.ring);
    sun.color.setHex(visual.sun); rim.color.setHex(visual.rim); fill.color.setHex(visual.fill);
    ambient.color.setHex(visual.rim); fog.color.setHex(visual.fog); starField.rotation.y=(sector-1)*.8;
    cosmos.userData.sector=sector;
  };
  setSector(1);
  return { root: cosmos, update: dt => storms.update(dt), setSector };
}
