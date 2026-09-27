export class RaceAudio {
  muted=false;
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private motor:OscillatorNode|null=null;
  private motorGain:GainNode|null=null;
  private tireGain:GainNode|null=null;
  start():void {
    try {
      if(!this.context){
        this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.14;this.master.connect(this.context.destination);
        this.motor=this.context.createOscillator();this.motor.type='sawtooth';this.motorGain=this.context.createGain();this.motorGain.gain.value=0;
        const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=480;
        this.motor.connect(filter);filter.connect(this.motorGain);this.motorGain.connect(this.master);this.motor.start();
        const noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate),samples=noise.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
        const source=this.context.createBufferSource();source.buffer=noise;source.loop=true;
        const tireFilter=this.context.createBiquadFilter();tireFilter.type='bandpass';tireFilter.frequency.value=1450;tireFilter.Q.value=1.8;
        this.tireGain=this.context.createGain();this.tireGain.gain.value=0;
        source.connect(tireFilter);tireFilter.connect(this.tireGain);this.tireGain.connect(this.master);source.start();
      }
      void this.context.resume().catch(()=>{});
    }catch{/* Sound is optional on browsers without an audio context. */}
  }
  toggle():boolean {this.muted=!this.muted;if(this.master&&this.context)this.master.gain.setTargetAtTime(this.muted?0:.14,this.context.currentTime,.03);return this.muted;}
  update(speed:number,boost:boolean,active:boolean,slip=0):void {
    if(!this.context||!this.motor||!this.motorGain)return;
    this.motor.frequency.setTargetAtTime(40+speed*.9+(boost?40:0),this.context.currentTime,.13);
    this.motorGain.gain.setTargetAtTime(active?.045+speed*.0009:0,this.context.currentTime,.08);
    this.tireGain?.gain.setTargetAtTime(active?Math.max(0,slip-.18)*.55*Math.min(1,speed/35):0,this.context.currentTime,.07);
  }
  beep(frequency=660,duration=.13):void {
    if(!this.context||!this.master||this.muted)return;
    const o=this.context.createOscillator(),g=this.context.createGain(),now=this.context.currentTime;
    o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(.25,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
    o.connect(g);g.connect(this.master);o.start();o.stop(now+duration);o.onended=()=>{o.disconnect();g.disconnect();};
  }
}
