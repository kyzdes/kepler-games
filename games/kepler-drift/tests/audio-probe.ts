import { GameAudio } from '../src/audio';

const result=document.querySelector<HTMLPreElement>('#result')!;
const samples=document.querySelector<HTMLElement>('#samples')!;
const rate=44100;

async function render(radius:number,pan=0,distance=0,muted=false,count=1) {
  const context=new OfflineAudioContext(2,Math.ceil(rate*2),rate);
  const audio=new GameAudio();
  audio.context=context as unknown as AudioContext;
  audio.master=context.createGain(); audio.master.gain.value=.25; audio.master.connect(context.destination);
  audio.muted=muted;
  for(let i=0;i<count;i++) audio.rock(radius,pan,distance);
  const voices=()=>((audio as unknown as {explosions:Set<unknown>}).explosions.size);
  const before=voices(), buffer=await context.startRendering();
  await new Promise(resolve=>setTimeout(resolve,0));
  return {buffer,before,after:voices()};
}
function rms(buffer:AudioBuffer,start=0,end=2,channel=0):number {
  const data=buffer.getChannelData(channel),from=Math.floor(start*rate),to=Math.min(data.length,Math.floor(end*rate));
  let sum=0; for(let i=from;i<to;i++) sum+=data[i]*data[i];
  return Math.sqrt(sum/(to-from));
}
function peak(buffer:AudioBuffer):number {
  let max=0;
  for(let c=0;c<buffer.numberOfChannels;c++) for(const value of buffer.getChannelData(c)) max=Math.max(max,Math.abs(value));
  return max;
}
function wav(buffer:AudioBuffer):Blob {
  const out=new ArrayBuffer(44+buffer.length*4),v=new DataView(out);
  const text=(at:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
  text(0,'RIFF'); v.setUint32(4,out.byteLength-8,true); text(8,'WAVE'); text(12,'fmt '); v.setUint32(16,16,true);
  v.setUint16(20,1,true); v.setUint16(22,2,true); v.setUint32(24,rate,true); v.setUint32(28,rate*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true);
  text(36,'data'); v.setUint32(40,buffer.length*4,true);
  for(let i=0;i<buffer.length;i++) for(let c=0;c<2;c++) v.setInt16(44+(i*2+c)*2,Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]))*32767,true);
  return new Blob([out],{type:'audio/wav'});
}
const sampleUrls:string[]=[];
document.querySelector<HTMLButtonElement>('#run')!.onclick=async()=>{
  result.textContent='Рендерим настоящие звуковые узлы Web Audio…';
  try {
    const small=await render(1.5), large=await render(4.5), muted=await render(4.5,0,0,true), crowded=await render(6,.8,0,false,20);
    const left=await render(4.5,-.8), far=await render(4.5,0,240);
    const checks:{name:string;passed:boolean;details?:unknown}[]=[];
    const check=(name:string,passed:boolean,details?:unknown)=>checks.push({name,passed,details});
    check('Крупный взрыв существенно мощнее мелкого скола',rms(large.buffer,0,.4)>rms(small.buffer,0,.4)*2,{small:rms(small.buffer,0,.4),large:rms(large.buffer,0,.4)});
    check('За ударом слышен затухающий гул без постоянного шума',rms(large.buffer,.25,.5)>.001 && rms(large.buffer,.7,.9)<rms(large.buffer,.25,.5) && rms(large.buffer,1.8,2)===0);
    check('Выключение звука подавляет взрыв',peak(muted.buffer)===0 && muted.before===0);
    check('Серия взрывов ограничена четырьмя голосами и не клиппирует',crowded.before===4 && peak(crowded.buffer)<.95,{voices:crowded.before,peak:peak(crowded.buffer)});
    check('Звуковые узлы освобождаются после затухания',large.after===0 && crowded.after===0);
    check('Взрыв слева слышнее в левом канале',rms(left.buffer,0,1,0)>rms(left.buffer,0,1,1)*3);
    check('Далёкий взрыв тише близкого',rms(far.buffer)<rms(large.buffer)*.5);
    for(const url of sampleUrls) URL.revokeObjectURL(url); sampleUrls.length=0; samples.replaceChildren();
    for(const [name,buffer] of [['Мелкий астероид',small.buffer],['Крупный астероид',large.buffer],['Серия крупных взрывов',crowded.buffer]] as const) {
      const label=document.createElement('p'); label.textContent=name;
      const audio=document.createElement('audio'); audio.controls=true; audio.src=URL.createObjectURL(wav(buffer)); sampleUrls.push(audio.src);
      samples.append(label,audio);
    }
    result.textContent=JSON.stringify({passed:checks.every(c=>c.passed),checks},null,2);
  } catch(error) {result.textContent=JSON.stringify({passed:false,error:String(error)});}
};
