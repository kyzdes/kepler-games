/** Scene-only radial blur. The central aim area and DOM instruments stay sharp. */
export const BoostBlurShader = {
  uniforms: { tDiffuse: {value:null}, strength: {value:0} },
  vertexShader: `varying vec2 vUv;
    void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `uniform sampler2D tDiffuse;uniform float strength;varying vec2 vUv;
    void main(){
      vec2 radial=vUv-.5;
      float edge=smoothstep(.50,1.15,length(radial*2.));
      vec2 delta=radial*edge*strength*.030;
      vec4 color=texture2D(tDiffuse,vUv)*5.;
      for(int i=1;i<=4;i++){
        float f=float(i)/4.;float weight=5.-float(i);
        color+=(texture2D(tDiffuse,clamp(vUv+delta*f,0.,1.))+texture2D(tDiffuse,clamp(vUv-delta*f,0.,1.)))*weight;
      }
      gl_FragColor=color/25.;
    }`,
};
