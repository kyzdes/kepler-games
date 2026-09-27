/** Original outer-belt sky restored from the first published flight version. */
export const QuietSkyShader = {
  vertexShader: 'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `varying vec3 vDir;
    float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float fbm(vec3 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.09+vec3(11.3,7.1,3.8);a*=.5;}return v;}
    void main(){vec3 d=normalize(vDir);float band=pow(max(0.,1.-abs(d.y-.4*d.x-.12)*1.7),4.);float n=fbm(d*5.+vec3(7,3,11));float n2=fbm(d*15.+n*2.);float light=pow(n*n2,1.4)*band;vec3 c=vec3(.018,.035,.055)+light*vec3(.1,.24,.36);gl_FragColor=vec4(c,1.);}`,
};
