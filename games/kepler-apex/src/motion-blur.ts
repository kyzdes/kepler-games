import * as T from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CAR_BOUNDS } from './framing.ts';

/** Single-frame, depth-reprojected camera motion blur. No temporal ghost trail. */
export class MotionBlurPass extends Pass {
  private previous=new T.Matrix4();
  private current=new T.Matrix4();
  private ready=false;
  private material=new T.ShaderMaterial({
    depthTest:false,depthWrite:false,
    uniforms:{tDiffuse:{value:null},tDepth:{value:null},inverseVP:{value:new T.Matrix4()},previousVP:{value:new T.Matrix4()},
      exposure:{value:0},carBox:{value:new T.Vector4(0,0,0,0)},nearFar:{value:new T.Vector2(.15,2000)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      uniform sampler2D tDiffuse,tDepth;
      uniform mat4 inverseVP,previousVP;
      uniform float exposure;
      uniform vec4 carBox;
      uniform vec2 nearFar;
      varying vec2 vUv;
      float carMask(vec2 uv){
        vec2 d=abs(uv-carBox.xy)-carBox.zw;
        return 1.-smoothstep(-.006,.012,max(d.x,d.y));
      }
      float viewDepth(float d){return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
      void main(){
        vec4 original=texture2D(tDiffuse,vUv);
        if(exposure<.001||carMask(vUv)>.99){gl_FragColor=original;return;}
        float depth=texture2D(tDepth,vUv).x;
        vec4 world=inverseVP*vec4(vUv*2.-1.,depth*2.-1.,1.);
        world/=world.w;
        vec4 old=previousVP*world;
        vec2 velocity=(vUv-(old.xy/max(old.w,.0001)*.5+.5))*exposure;
        float magnitude=length(velocity);
        velocity*=min(1.,.045/max(magnitude,.00001));
        float centerDepth=viewDepth(depth);
        vec3 color=original.rgb;
        float weight=1.;
        for(int i=0;i<10;i++){
          float t=(float(i)/9.-.5);
          vec2 uv=clamp(vUv+velocity*t,vec2(.001),vec2(.999));
          float other=viewDepth(texture2D(tDepth,uv).x);
          float w=(1.-abs(t))*(1.-carMask(uv));
          // Keep foreground silhouettes out of the background's blur samples.
          w*=1.-smoothstep(.08,.25,abs(other-centerDepth)/max(centerDepth,1.));
          color+=texture2D(tDiffuse,uv).rgb*w;weight+=w;
        }
        gl_FragColor=vec4(mix(color/weight,original.rgb,carMask(vUv)),original.a);
      }`,
  });
  private quad=new FullScreenQuad(this.material);
  reset():void {this.ready=false;}
  prepare(camera:T.PerspectiveCamera,car:T.Object3D,dt:number,speed:number,boost:boolean,active:boolean):void {
    camera.updateMatrixWorld();car.updateWorldMatrix(true,false);
    this.current.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const u=this.material.uniforms;
    u.inverseVP.value.copy(this.current).invert();
    u.previousVP.value.copy(this.ready?this.previous:this.current);
    const speedAmount=T.MathUtils.smoothstep(speed,20,100);
    u.exposure.value=active&&this.ready&&dt>0?Math.min(2,(boost?.026:.018)/dt)*speedAmount:0;
    u.nearFar.value.set(camera.near,camera.far);
    let minX=1,minY=1,maxX=0,maxY=0;
    for(const corner of CAR_BOUNDS){
      const p=corner.clone().applyMatrix4(car.matrixWorld).project(camera);
      const x=p.x*.5+.5,y=p.y*.5+.5;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    }
    u.carBox.value.set((minX+maxX)/2,(minY+maxY)/2,(maxX-minX)/2+.005,(maxY-minY)/2+.004);
    this.previous.copy(this.current);this.ready=active;
  }
  override render(renderer:T.WebGLRenderer,writeBuffer:T.WebGLRenderTarget,readBuffer:T.WebGLRenderTarget):void {
    this.material.uniforms.tDiffuse.value=readBuffer.texture;
    this.material.uniforms.tDepth.value=readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
  }
  override dispose():void {this.material.dispose();this.quad.dispose();}
}
