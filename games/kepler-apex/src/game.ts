import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createEnvironment } from './environment';
import { createCar } from './car';
import { createTrack, curvatureAt, TRACK_LENGTH } from './track';
import { createRace, stepRace, wrap } from './rules';
import type { Input, Phase } from './rules';
import { RaceAudio } from './audio';
import { RaceView } from './race-view';
import { MotionBlurPass } from './motion-blur';
import { TireTrails } from './tire-trails';

export interface Hooks { update(game:Game):void; phase(game:Game):void; toast(text:string):void; error(message:string):void; }
export class Game {
  race=createRace();
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(58,1,.15,2000);
  readonly renderer:T.WebGLRenderer;
  readonly composer:EffectComposer;
  readonly audio=new RaceAudio();
  readonly keys=new Set<string>();
  readonly touch={left:false,right:false,brake:false,boost:false};
  readonly cars=[createCar(),createCar(0x477c9a),createCar(0x978255),createCar(0x527b69),createCar(0x6d648e),createCar(0x8c4642)];
  readonly reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly view = new RaceView(this.camera, this.cars, this.reduced);
  autoThrottle=true;
  loaded=false;
  private cosmos:T.Group|null=null;
  private antialias=new ShaderPass(FXAAShader);
  private motionBlur=new MotionBlurPass();
  private trails:TireTrails;
  private lastFrame=0;
  private viewClock=0;
  private uiClock=0;
  private beforePause:Phase='racing';
  constructor(private host:HTMLElement,private hooks:Hooks) {
    this.renderer=new T.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.25:1.5));
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    this.renderer.domElement.setAttribute('aria-label','Трёхмерная орбитальная гоночная трасса');this.renderer.domElement.tabIndex=0;host.append(this.renderer.domElement);
    const target=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,samples:0,depthTexture:new T.DepthTexture(1,1,T.UnsignedIntType)});
    this.composer=new EffectComposer(this.renderer,target);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.composer.addPass(this.motionBlur);
    this.composer.addPass(new UnrealBloomPass(new T.Vector2(1,1),.11,.3,3.8));
    this.composer.addPass(new OutputPass());this.composer.addPass(this.antialias);
    this.cars.forEach(c=>this.scene.add(c.root));
    this.trails=new TireTrails(this.scene);
    addEventListener('resize',()=>this.resize());
    addEventListener('blur',()=>this.pause());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    const codes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'];
    addEventListener('keydown',e=>{if(codes.includes(e.code)&&['racing','countdown'].includes(this.race.phase)){if((e.target as HTMLElement)?.tagName!=='BUTTON')e.preventDefault();this.keys.add(e.code);}});
    addEventListener('keyup',e=>this.keys.delete(e.code));
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.pause();this.hooks.error('Графика была прервана. Перезагрузите игру, чтобы восстановить трассу.');});
    this.resize();
  }
  async load(progress:(text:string,value:number)=>void):Promise<void> {
    const loader=new T.TextureLoader();progress('Подготовка орбиты',15);
    const [ice,stone]=await Promise.all([loader.loadAsync('/textures/kepler-ice.webp'),loader.loadAsync('/textures/moon.jpg')]);
    ice.colorSpace=T.SRGBColorSpace;stone.colorSpace=T.SRGBColorSpace;
    this.cosmos=createEnvironment(this.scene,this.renderer,ice);progress('Сборка гоночного кольца',50);
    await new Promise<void>(r=>requestAnimationFrame(()=>r()));createTrack(this.scene,stone);progress('Проверка систем болида',82);
    this.updateWorld(0);await this.renderer.compileAsync(this.scene,this.camera);this.composer.render();
    this.loaded=true;progress('Трасса готова',100);requestAnimationFrame(this.frame);this.hooks.update(this);
  }
  private resize():void {
    const w=this.host.clientWidth,h=this.host.clientHeight;this.camera.aspect=w/Math.max(1,h);this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h);this.composer.setSize(w,h);const ratio=this.renderer.getPixelRatio();this.antialias.uniforms.resolution.value.set(1/(w*ratio),1/(h*ratio));
    this.view.resetCamera();this.motionBlur.reset();
  }
  start():void {
    this.race=createRace();this.race.phase='countdown';this.motionBlur.reset();this.trails.reset();
    this.view.reset();this.clearInput();this.audio.start();this.hooks.phase(this);
  }
  pause():void {
    if(this.race.phase!=='racing'&&this.race.phase!=='countdown')return;
    this.beforePause=this.race.phase;this.race.phase='paused';this.motionBlur.reset();this.clearInput();this.audio.update(0,false,false);this.hooks.phase(this);
  }
  resume():void {if(this.race.phase!=='paused')return;this.clearInput();this.motionBlur.reset();this.audio.start();this.race.phase=this.beforePause;this.hooks.phase(this);}
  menu():void {this.race=createRace();this.motionBlur.reset();this.trails.reset();this.view.reset();this.clearInput();this.hooks.phase(this);}
  clearInput():void {this.keys.clear();this.touch.left=this.touch.right=this.touch.brake=this.touch.boost=false;}
  private input():Input {
    return {steer:Number(this.keys.has('KeyD')||this.keys.has('ArrowRight')||this.touch.right)-Number(this.keys.has('KeyA')||this.keys.has('ArrowLeft')||this.touch.left),
      throttle:this.autoThrottle||this.keys.has('KeyW')||this.keys.has('ArrowUp'),brake:this.keys.has('KeyS')||this.keys.has('ArrowDown')||this.touch.brake,
      handbrake:this.keys.has('Space'),
      boost:this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.touch.boost};
  }
  private frame=(time:number):void=>{
    requestAnimationFrame(this.frame);
    const dt=this.lastFrame?Math.min((time-this.lastFrame)/1000,.06):0;this.lastFrame=time;
    if(document.hidden)return;
    const phase=this.race.phase, laps=this.race.lapTimes.length, hits=this.race.hits,pads=this.race.pads,count=Math.ceil(this.race.countdown);
    // Fixed small substeps keep collisions and boost stable through variable frame times.
    let remaining=dt;while(remaining>0){const step=Math.min(remaining,1/120);stepRace(this.race,this.input(),step,TRACK_LENGTH,curvatureAt);remaining-=step;}
    if(phase!==this.race.phase){if(this.race.phase==='racing')this.audio.beep(1000,.25);this.hooks.phase(this);}
    if(Math.ceil(this.race.countdown)!==count&&this.race.phase==='countdown')this.audio.beep(480);
    if(this.race.hits>hits){this.hooks.toast('Контакт · потеря скорости');this.audio.beep(95,.12);}
    if(this.race.pads>pads){this.hooks.toast('Разгонная полоса · +18% энергии');this.audio.beep(820,.15);}
    if(this.race.lapTimes.length>laps&&this.race.phase==='racing'){this.hooks.toast(this.race.lapTimes.length===2?'Последний круг':'Круг пройден');this.audio.beep(780,.2);}
    if(this.race.phase!=='paused')this.viewClock+=dt;
    this.updateWorld(dt);
    const active=this.race.phase==='racing',p=this.race.drivers[0];
    if(active)this.trails.update(p.distance,p.lane,this.race.heading,this.race.slip,this.input().brake||!!this.input().handbrake);
    this.audio.update(p.speed,this.race.boosting,active,this.race.slip);
    this.motionBlur.prepare(this.camera,this.cars[0].body,dt,p.speed,this.race.boosting||this.race.padBoost>0,active&&!this.reduced);
    this.composer.render(dt);
    this.uiClock+=dt;if(this.uiClock>.06){this.uiClock=0;this.hooks.update(this);}
  };
  private updateWorld(dt: number): void {
    this.view.update(this.race, this.input(), dt, this.viewClock, this.host.clientHeight);
    // The distant sky moves with the viewer; the track and asteroids have real parallax.
    this.cosmos?.position.copy(this.camera.position);
  }
  get progress():number{return wrap(this.race.drivers[0].distance,TRACK_LENGTH)/TRACK_LENGTH;}
}
