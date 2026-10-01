import { createExplosionNoise, LARGE_ASTEROID_RADIUS, playAsteroidExplosion } from './explosion';

export class GameAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  engine: GainNode | null = null;
  muted = false;
  lastShot = 0;
  private noise: AudioBuffer | null = null;
  private readonly explosions = new Set<AudioBufferSourceNode>();
  private readonly engines: OscillatorNode[] = [];
  private flying = false;
  private boosting = false;
  private cutting = false;
  private cutterGain: GainNode | null = null;
  start(): void {
    if(!this.context) {
      this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.25;this.master.connect(this.context.destination);
      this.engine=this.context.createGain();this.engine.gain.value=0;this.engine.connect(this.master);
      this.noise = createExplosionNoise(this.context);
      for(const freq of [48,73]) {const o=this.context.createOscillator();o.type='sine';o.frequency.value=freq;o.connect(this.engine);o.start();this.engines.push(o);}
      this.cutterGain=this.context.createGain();this.cutterGain.gain.value=0;this.cutterGain.connect(this.master);
      const beam=this.context.createOscillator();beam.type='triangle';beam.frequency.value=185;beam.connect(this.cutterGain);beam.start();
    }
    void this.context.resume().catch(()=>{});
  }
  setFlying(flying:boolean):void { this.flying=flying; this.updateEngine(); }
  setBoosting(boosting:boolean):void {
    if(this.boosting===boosting)return;
    this.boosting=boosting; this.updateEngine();
  }
  private updateEngine():void {
    if(!this.context||!this.engine)return;
    const t=this.context.currentTime, boost=this.flying&&this.boosting;
    this.engine.gain.setTargetAtTime(this.flying?(boost?.19:.075):0,t,.15);
    this.engines.forEach((osc,i)=>osc.frequency.setTargetAtTime([48,73][i]*(boost?1.9:1),t,.15));
  }
  toggle():boolean {this.muted=!this.muted;if(this.context&&this.master)this.master.gain.setTargetAtTime(this.muted?0:.25,this.context.currentTime,.05);return this.muted;}
  tone(from:number,to:number,duration:number,volume:number,type:OscillatorType='sine'):void {
    if(!this.context||!this.master||this.muted)return;
    const t=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
  shot():void {if(this.context&&this.context.currentTime-this.lastShot>.1){this.lastShot=this.context.currentTime;this.tone(570,110,.11,.12,'triangle');}}
  plasma():void {this.tone(260,45,.3,.22,'triangle');}
  cutter():void {this.tone(900,190,.3,.18,'sawtooth');}
  setCutting(cutting:boolean):void {
    if(this.cutting===cutting)return;
    this.cutting=cutting;
    if(this.context&&this.cutterGain)this.cutterGain.gain.setTargetAtTime(cutting?.085:0,this.context.currentTime,.05);
  }
  hit():void {this.tone(84,28,.28,.36,'sawtooth');}
  rock(radius=1, pan=0, distance=0):void {
    if(!this.context||!this.master||this.muted)return;
    if(radius<LARGE_ASTEROID_RADIUS) { this.tone(135,30,.36,.2,'triangle'); return; }
    // Keep rapid multishot kills from building an unbounded wall of sound.
    if(this.explosions.size>=4)return;
    this.noise ??= createExplosionNoise(this.context);
    const voice=playAsteroidExplosion(this.context,this.master,this.noise,radius,pan,distance,
      1/(1+this.explosions.size),()=>this.explosions.delete(voice));
    this.explosions.add(voice);
  }
  pickup():void {this.tone(720+Math.random()*280,1450,.09,.09);}
  upgrade():void {this.tone(390,1170,.5,.24,'triangle');}
}
