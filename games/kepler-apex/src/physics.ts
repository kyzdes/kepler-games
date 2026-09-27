const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export interface Dynamics {
  steering:number; heading:number; yawRate:number; lateralSpeed:number;
  acceleration:number; lateralAcceleration:number; slip:number; impact:number;
}
export function createDynamics():Dynamics {
  return {steering:0,heading:0,yawRate:0,lateralSpeed:0,acceleration:0,lateralAcceleration:0,slip:0,impact:0};
}
export function stepVehicle(
  body:{speed:number;lane:number},state:Dynamics,
  input:{steer:number;throttle:boolean;brake:boolean;handbrake?:boolean},
  dt:number,bend:number,topSpeed:number,boost:boolean,
):void {
  const before=body.speed,handbrake=!!input.handbrake;
  const drag=3+body.speed*body.speed*.0011;
  const engine=(input.throttle||boost?48*(1-.32*body.speed/topSpeed)+(boost?15:0):0);
  const braking=input.brake?85:handbrake?37:0;
  const force=body.speed>topSpeed&&!braking?-37:engine-drag-braking;
  // Brakes always override throttle. High-speed aero drag remains when coasting.
  body.speed=Math.max(0,body.speed+(braking?-drag-braking:force)*dt);
  if(before<=topSpeed)body.speed=Math.min(topSpeed,body.speed);
  else if(!braking&&body.speed<topSpeed)body.speed=topSpeed;
  const steeringDelta=clamp(input.steer,-1,1)-state.steering;
  const steeringMid=state.steering+steeringDelta*(1-Math.exp(-dt/ .32));
  state.steering+=steeringDelta*(1-Math.exp(-dt/ .16));

  // Arcade path assistance follows the track heading; relative yaw and tire
  // velocity remain independent, so steering cannot teleport the car sideways.
  const speedMid=(before+body.speed)/2,headingBefore=state.heading;
  const headingTarget=steeringMid*(handbrake?.5:.27)/(1+speedMid*.002);
  const spring=handbrake?24:55,damping=handbrake?6:12;
  const yawMid=state.yawRate+((headingTarget-state.heading)*spring-state.yawRate*damping)*dt/2;
  const headingMid=state.heading+state.yawRate*dt/2;
  state.yawRate+=((headingTarget-headingMid)*spring-yawMid*damping)*dt;
  state.heading=clamp(state.heading+yawMid*dt,-.6,.6);
  const centrifugal=clamp(bend,-.035,.035)*speedMid*speedMid;
  const lateralTarget=Math.sin((headingBefore+state.heading)/2)*speedMid;
  const relaxation=handbrake?2.1:5.2;
  const demand=(lateralTarget-state.lateralSpeed)*relaxation-centrifugal*.97;
  const brakeGrip=input.brake?.76:1;
  const grip=(43+body.speed*body.speed*.0028)*(handbrake?.37:1)*brakeGrip;
  const lateralBefore=state.lateralSpeed;
  const lateralMid=lateralBefore+(clamp(demand,-grip,grip)+centrifugal)*dt/2;
  const tireForce=clamp((lateralTarget-lateralMid)*relaxation-centrifugal*.97,-grip,grip);
  state.lateralAcceleration=tireForce;
  state.lateralSpeed+=(tireForce+centrifugal)*dt;
  // At walking pace static friction stops residual sliding.
  if(body.speed<8)state.lateralSpeed*=Math.exp(-(8-body.speed)*dt);
  body.lane+=(lateralBefore+state.lateralSpeed)*dt/2;
  const slipAngle=state.heading-Math.atan2(state.lateralSpeed,Math.max(body.speed,2));
  const saturation=Math.max(0,Math.abs(demand)-grip)/Math.max(grip,1);
  const slipTarget=body.speed>12?clamp(Math.abs(slipAngle)*4+saturation*.35,0,1):0;
  state.slip+=(slipTarget-state.slip)*(1-Math.exp(-8*dt));
  body.speed=Math.max(0,body.speed-state.slip*(handbrake?8:4)*dt);
  state.acceleration=(body.speed-before)/dt;
  state.impact=Math.max(0,state.impact-dt*2.5);
}
