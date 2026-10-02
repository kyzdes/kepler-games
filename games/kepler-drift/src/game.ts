import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createEnvironment } from './environment';
import type { SpaceEnvironment } from './environment';
import { createShip, createRock, rockGeometry } from './models';
import type { Rock } from './asteroids';
import { Projectiles } from './projectiles';
import { CuttingBeam } from './cutting-beam';
import { WeaponBattery, WEAPONS, cutterRecharge, PLASMA_RADIUS, CUTTER_RANGE } from './weapons';
import type { WeaponId } from './weapons';
import { asteroidKind, blastDamage, blastRadius, flightHint } from './hazards';
import { AsteroidVisuals } from './asteroid-visuals';
import { Salvage } from './salvage';
import { FlightEffects } from './flight-effects';
import { GameAudio } from './audio';
import { PointerFire, horizontalInput, rollDirection } from './input';
import { BarrelRoll, ROLL_PROTECTION } from './maneuvers';
import { ShipCollider } from './collision';
import { StableFlightCamera } from './camera';
import { BoostDrive, boostEnvelope, BOOST_FORWARD_MULTIPLIER, BOOST_PROTECTION } from './boost';
import { BoostBlurShader } from './boost-blur';
import { SECTOR_TEXTURE_URLS } from './sectors';
import { paintLoadingFrame } from './loading';
import type { LoadingProgress } from './loading';
import { createRun, clamp, damageShip, collectOre, mulberry32, flightSpeed, SECTOR_SECONDS, TOTAL_SECTORS } from './state';
import type { Run } from './state';
import type { RunMode } from './expedition';
import { visualSector, shouldSpawnBoss, canAdvanceSector, isExpeditionComplete, canExtract, cappedForwardSpeed, nextSector as nextExpeditionSector } from './expedition';
import { PirateFleet } from './pirates';
import type { Pirate } from './pirates';
import { MiningBoss, BOSS_CUTTER_DPS } from './mining-boss';
import type { CombatTarget } from './combat';
import { createExpeditionProps } from './expedition-props';

export interface GameHooks { update(game: Game): void; phase(game: Game): void; toast(text: string): void; help(): void; sound(muted: boolean): void; }

export class Game {
  run: Run = createRun();
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(59, 1, .1, 1500);
  readonly renderer: T.WebGLRenderer;
  readonly composer: EffectComposer;
  private readonly antialiasPass = new ShaderPass(FXAAShader);
  private readonly boostBlurPass = new ShaderPass(BoostBlurShader);
  readonly ship = createShip();
  readonly audio = new GameAudio();
  readonly rocks: Rock[] = [];
  readonly pirates: PirateFleet;
  readonly boss: MiningBoss;
  private readonly expeditionProps = createExpeditionProps();
  private readonly combatBuffer: CombatTarget[] = [];
  combatTarget: CombatTarget | null = null;
  readonly pointer = new T.Vector2(0, 0);
  readonly touchMove = new T.Vector2();
  readonly velocity = new T.Vector2();
  readonly keys = new Set<string>();
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly projectiles = new Projectiles(this.scene);
  readonly weapons = new WeaponBattery();
  private readonly beam = new CuttingBeam(this.scene);
  private asteroidVisuals: AsteroidVisuals | null = null;
  private readonly salvage = new Salvage(this.scene, () => this.rng());
  private readonly effects: FlightEffects;
  private cosmos: SpaceEnvironment | null = null;
  private ray = new T.Raycaster();
  private rng = mulberry32(Date.now());
  private lastFrame = 0;
  private flightClock = 0;
  private frameClock = 0;
  private uiClock = 0;
  private lastDamage = -20;
  private invulnerable = 0;
  private readonly shipCollider = new ShipCollider();
  private readonly shipFrameStart = new T.Matrix4();
  private flash = 0;
  private lastPickupSound = 0;
  private raySphere = new T.Sphere();
  private tmp = new T.Vector3();
  private tmp2 = new T.Vector3();
  private startPoint = new T.Vector3();
  private aimPoint = new T.Vector3();
  private touchDevice = matchMedia('(pointer: coarse)').matches;
  private readonly boostDrive = new BoostDrive();
  get boostTime(): number { return this.boostDrive.remaining; }
  get boostCooldown(): number { return this.boostDrive.cooldown; }
  private armoryReturn: 'flying' | 'paused' = 'flying';
  get armoryReturnsToPause(): boolean { return this.armoryReturn==='paused'; }
  readonly roll = new BarrelRoll();
  private bankAngle = 0;
  readonly fireInput = new PointerFire();
  get shooting(): boolean { return this.fireInput.active; }
  private readonly cameraRig = new StableFlightCamera();
  private flightY = 0;
  autoFire = true;
  get forwardSpeed(): number { return (this.run.mode==='endless'?cappedForwardSpeed(this.run.sector,this.run.sectorTime):flightSpeed(this.run.sector, this.run.sectorTime)) * (this.boostTime > 0 ? BOOST_FORWARD_MULTIPLIER : 1); }
  target: Rock | null = null;
  loaded = false;
  fps = 60;

  constructor(private host: HTMLElement, private hooks: GameHooks) {
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.touchDevice ? 1.25 : 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.setAttribute('aria-label', 'Трёхмерный полёт в поясе астероидов');
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    // Bloom blends into the scene buffer again. MSAA color data can be discarded
    // after its first resolve, so that blend loses the scene on tiled GPUs.
    // Keep HDR targets single-sampled and smooth the final image with FXAA.
    const renderTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new T.Vector2(1, 1), .24, .35, 1.65));
    this.boostBlurPass.enabled=false;
    this.composer.addPass(this.boostBlurPass);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.antialiasPass);
    this.scene.add(this.ship.root);
    this.camera.position.set(0, 4, 18.2);
    this.camera.lookAt(0, 1.5, -35);
    this.effects = new FlightEffects(this.scene, () => this.rng());
    this.pirates = new PirateFleet(this.scene, () => this.rng(), {
      hitPlayer: (amount, reason) => { if (this.invulnerable<=0 && this.run.hull>0) this.hurtShip(amount,reason); },
      destroyed: enemy => this.destroyPirate(enemy),
      shot: () => this.audio.tone(150,70,.09,.025,'sawtooth'),
    }, this.reducedMotion);
    this.boss = new MiningBoss(this.scene, {
      hitPlayer: (amount, reason) => { if (this.invulnerable<=0 && this.run.hull>0) this.hurtShip(amount,reason); },
      destroyed: position => {
        this.run.bossKills++; this.effects.shockwave(position,23,0xffbd65);
        this.effects.burst(position,new T.Color(2.5,.9,.2),90,16);
        this.salvage.dropReward(position,100,6); this.audio.rock(6,0,50);
        this.hooks.toast('Реактор разрушен · путь свободен · 100 руды в обломках');
      },
      shot: () => this.audio.tone(90,45,.16,.06,'triangle'),
    }, this.reducedMotion);
    this.expeditionProps.root.visible=false;
    this.scene.add(this.expeditionProps.root);
    this.bindControls();
    this.resize();
    this.cameraRig.reset(this.camera);
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.pause(); this.hooks.toast('Графический контекст прерван. Обновите страницу, чтобы продолжить.'); });
  }

  async init(onProgress: (progress: LoadingProgress) => void = () => {}): Promise<void> {
    onProgress({ percent:8, stage:0, label:'Загружаем ресурсы экспедиции' });
    await paintLoadingFrame();
    const loader = new T.TextureLoader();
    const urls = ['/textures/moon.jpg', ...SECTOR_TEXTURE_URLS];
    let texturesLoaded = 0;
    const loadTexture = async (url: string): Promise<T.Texture> => {
      const texture = await loader.loadAsync(url);
      texture.name=url; texture.colorSpace=T.SRGBColorSpace;
      texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
      onProgress({ percent:12 + ++texturesLoaded / urls.length * 24, stage:0, label:`Загружаем миры ${TOTAL_SECTORS} секторов` });
      return texture;
    };
    const loadedTextures = await Promise.all(urls.map(loadTexture));
    const textures = new Map(urls.map((url,i)=>[url,loadedTextures[i]]));
    const moon = loadedTextures[0];
    onProgress({ percent:38, stage:1, label:'Создаём пояс астероидов' });
    await paintLoadingFrame();
    this.cosmos = createEnvironment(this.scene, this.renderer, textures, this.reducedMotion);
    const rockMap = moon.clone(); rockMap.wrapS = rockMap.wrapT = T.RepeatWrapping; rockMap.repeat.set(3, 2); rockMap.needsUpdate = true;
    const rockMaterial = new T.MeshStandardMaterial({ color: 0x58636d, map: rockMap, bumpMap: rockMap, bumpScale: .64, vertexColors: true, roughness: .97, metalness: .14 });
    this.asteroidVisuals = new AsteroidVisuals(rockMaterial);
    const geometries: T.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      geometries.push(rockGeometry(614 + i * 17));
      onProgress({ percent:40 + (i + 1) * 2, stage:1, label:'Создаём пояс астероидов' });
      if (i % 3 === 2) await paintLoadingFrame();
    }
    for (let i = 0; i < 66; i++) {
      const radius = i === 0 ? 3.1 : 1 + this.rng() ** 1.4 * 4.8;
      const isOre = i % 4 !== 3;
      const root = createRock(geometries[i % geometries.length], rockMaterial, radius, isOre, i * 57 + 9);
      this.scene.add(root);
      const hp = 12 + radius * 8;
      const rock: Rock = { root, radius, hp, maxHp: hp, ore: isOre, kind: 'normal', spin: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .5).multiplyScalar(.13), wait: 0 };
      this.asteroidVisuals.register(rock, i * 57 + 9);
      this.rocks.push(rock); this.placeRock(rock, true, i);
      if (i % 22 === 21) {
        onProgress({ percent:58 + (i + 1) / 66 * 14, stage:1, label:'Создаём пояс астероидов' });
        await paintLoadingFrame();
      }
    }
    // Distant belt uses a single instanced draw instead of hundreds of meshes.
    const distant = new T.InstancedMesh(geometries[2], rockMaterial, 210);
    const d = new T.Object3D(); const rng = mulberry32(27);
    for (let i = 0; i < 210; i++) {
      d.position.set((rng() - .5) * 1100, (rng() - .5) * 460, -250 - rng() * 650);
      d.scale.setScalar(1 + rng() * 5); d.rotation.set(rng() * 6, rng() * 6, rng() * 6); d.updateMatrix(); distant.setMatrixAt(i, d.matrix);
    }
    this.scene.add(distant);
    onProgress({ percent:78, stage:2, label:'Запускаем системы корабля' });
    await paintLoadingFrame();
    for (let i=0;i<loadedTextures.length;i++) {
      this.renderer.initTexture(loadedTextures[i]);
      onProgress({ percent:78+(i+1)/loadedTextures.length*12,stage:2,label:'Подготавливаем планеты и галактики' });
      await paintLoadingFrame();
    }
    await this.renderer.compileAsync(this.scene, this.camera);
    this.cosmos?.setSector(2);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.cosmos?.setSector(1);
    onProgress({ percent:94, stage:2, label:'Проверяем готовность к полёту' });
    await paintLoadingFrame();
    // Warm the extra post-process shader under the loading screen.
    this.boostBlurPass.enabled=true; this.composer.render();
    this.boostBlurPass.enabled=false; this.composer.render();
    this.loaded = true;
    this.lastFrame = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    this.hooks.update(this);
    onProgress({ percent:100, stage:3, label:'Всё готово. Добро пожаловать на борт.' });
  }

  private placeRock(rock: Rock, initial = false, i = -1): void {
    const spread = initial ? 43 : 39;
    rock.root.position.set((this.rng() - .5) * spread, (this.rng() - .5) * 24, initial ? -25 - this.rng() * 260 : -190 - this.rng() * 100);
    if (initial && i === 0) rock.root.position.set(0, 1.15, -35);
    if (initial && i === 1) rock.root.position.set(8, 3.2, -55);
    if (initial && i === 2) rock.root.position.set(-10, -1, -42);
    if (initial && i === 3) rock.root.position.set(-16, 1, -12);
    if (initial && i === 4) rock.root.position.set(17, -5, -16);
    rock.root.rotation.set(this.rng() * 6, this.rng() * 6, this.rng() * 6);
    rock.kind = asteroidKind(this.run.sector, this.rng());
    if (this.boss?.active && Math.abs(rock.root.position.x)<7) rock.root.position.x=(this.rng()<.5?-1:1)*(9+this.rng()*12);
    rock.maxHp = (12 + rock.radius * 8) * (1 + (Math.min(this.run.sector,12) - 1) * .28) * (rock.kind === 'armored' ? 2.4 : 1);
    this.asteroidVisuals?.apply(rock);
    rock.wait = 0; rock.hp = rock.maxHp; rock.root.visible = true;
    (rock.previousPosition ??= new T.Vector3()).copy(rock.root.position);
  }

  start(mode: RunMode = this.run.mode): void {
    this.run = createRun(mode); this.run.phase = 'flying';
    this.autoFire = true; this.roll.reset(); this.bankAngle = 0;
    this.flightY = 0;
    this.cosmos?.setSector(1);
    this.rng = mulberry32(Date.now());
    this.ship.root.position.set(0, 0, 0); this.ship.root.rotation.set(0, 0, 0);
    this.cameraRig.reset(this.camera);
    this.velocity.set(0, 0); this.touchMove.set(0, 0); this.pointer.set(0, 0); this.keys.clear(); this.fireInput.clear();
    this.boostDrive.reset(); this.boostBlurPass.enabled=false;
    this.flightClock = this.invulnerable = 0; this.lastDamage = -20; this.flash = 0;
    this.weapons.reset(); this.beam.hide(); this.audio.setCutting(false);
    this.projectiles.reset(); this.salvage.reset(); this.effects.reset();
    this.pirates.reset(); this.boss.reset(); this.combatTarget=null;
    this.expeditionProps.root.visible=mode==='endless';
    this.rocks.forEach((rock, i) => this.placeRock(rock, true, i));
    this.audio.start(); this.audio.setFlying(true);
    this.hooks.phase(this); this.hooks.toast('Держите курс. Золотые жилы содержат руду.');
    this.renderer.domElement.focus({ preventScroll: true });
  }

  extract(): boolean {
    if (!canExtract(this.run.mode,this.run.phase,this.run.sector)) return false;
    this.salvage.collectAll(value=>collectOre(this.run,value));
    this.finish(true); return true;
  }

  returnToMenu(): void {
    this.start();
    this.run.phase='ready';this.audio.setFlying(false);this.hooks.phase(this);
  }

  pause(): void {
    if (this.run.phase !== 'flying') return;
    this.run.phase = 'paused'; this.keys.clear(); this.touchMove.set(0, 0); this.fireInput.clear(); this.audio.setFlying(false); this.hooks.phase(this);
  }
  resume(): void { if (this.run.phase === 'paused') { this.run.phase = 'flying'; this.audio.start(); this.audio.setFlying(true); this.hooks.phase(this); } }
  togglePause(): void { if(this.run.phase==='armory') this.closeArmory(); else this.run.phase === 'flying' ? this.pause() : this.resume(); }
  openArmory(): void {
    if(this.run.phase!=='flying' && this.run.phase!=='paused') return;
    this.armoryReturn=this.run.phase;
    this.run.phase='armory'; this.keys.clear(); this.touchMove.set(0,0); this.fireInput.clear();
    this.audio.setFlying(false); this.hooks.phase(this);
  }
  closeArmory(): void {
    if(this.run.phase!=='armory') return;
    this.run.phase=this.armoryReturn; this.keys.clear();
    if(this.run.phase==='flying') { this.audio.start(); this.audio.setFlying(true); this.renderer.domElement.focus({preventScroll:true}); }
    this.hooks.phase(this);
  }
  toggleAutoFire(): void { this.autoFire = !this.autoFire; this.hooks.update(this); }
  selectWeapon(id: WeaponId): void {
    if (!['flying', 'paused'].includes(this.run.phase) || !this.weapons.select(id)) return;
    this.beam.hide(); this.audio.setCutting(false);
    this.hooks.toast(`${WEAPONS[id].name} · ${WEAPONS[id].description}`);
    this.hooks.update(this);
  }
  boost(): void {
    if (this.run.phase !== 'flying' || !this.boostDrive.start()) return;
    this.invulnerable = Math.max(this.invulnerable, BOOST_PROTECTION);
    this.audio.tone(100, 290, .45, .22, 'triangle');
  }
  barrelRoll(direction = horizontalInput(this.keys, this.touchMove.x)): boolean {
    if (this.run.phase !== 'flying' || !this.roll.start(direction)) return false;
    this.invulnerable = Math.max(this.invulnerable, ROLL_PROTECTION);
    this.audio.tone(160, 420, .5, .16, 'triangle');
    this.hooks.toast(direction < 0 ? 'Бочка влево · уклонение' : 'Бочка вправо · уклонение');
    return true;
  }
  nextSector(): void {
    if (this.run.phase !== 'upgrade') return;
    this.run.sector=nextExpeditionSector(this.run.sector); this.run.sectorTime = 0; this.run.phase = 'flying';
    this.pirates.reset(); this.boss.reset(); this.combatTarget=null;
    this.cosmos?.setSector(visualSector(this.run.sector,this.run.mode));
    this.run.shield = this.run.maxShield;
    this.rocks.forEach(r => this.placeRock(r));
    this.projectiles.reset(); this.weapons.stopCutting(); this.beam.hide(); this.audio.setCutting(false);
    this.keys.clear(); this.fireInput.clear(); this.audio.setFlying(true); this.hooks.phase(this); this.hooks.toast(`Сектор ${this.run.sector} · ${flightHint(this.run.sector,this.run.mode)}`);
  }

  private bindControls(): void {
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && this.run.phase === 'flying') e.preventDefault();
      if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
      this.keys.add(e.code);
      const direction = rollDirection(this.keys, e.code, e.repeat);
      if (direction !== 0) this.barrelRoll(direction);
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.boost();
      if (e.code === 'KeyQ') this.toggleAutoFire();
      if (e.code === 'Digit1' || e.code === 'Numpad1') this.selectWeapon('pulse');
      if (e.code === 'Digit2' || e.code === 'Numpad2') this.selectWeapon('plasma');
      if (e.code === 'Digit3' || e.code === 'Numpad3') this.selectWeapon('cutter');
      if (e.code === 'KeyU') { this.run.phase==='armory' ? this.closeArmory() : this.openArmory(); }
      if (e.code === 'KeyH') this.hooks.help();
      if (e.code === 'KeyM') this.hooks.sound(this.audio.toggle());
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || this.shooting) this.setPointer(e.clientX, e.clientY); });
    canvas.addEventListener('pointerdown', e => { if (e.button === 0 && this.run.phase === 'flying') { canvas.focus(); this.setPointer(e.clientX, e.clientY); this.fireInput.press(e.pointerId); } });
    window.addEventListener('pointerup', e => this.fireInput.release(e.pointerId));
    window.addEventListener('pointercancel', e => this.fireInput.release(e.pointerId));
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  setPointer(x: number, y: number): void {
    const r = this.host.getBoundingClientRect(); this.pointer.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    const pixels = this.renderer.getDrawingBufferSize(new T.Vector2());
    this.antialiasPass.uniforms.resolution.value.set(1 / pixels.x, 1 / pixels.y);
  }

  private frame(): void {
    const now = performance.now(); const rawDt = (now - this.lastFrame) / 1000; this.lastFrame = now; const dt = Math.min(rawDt, .035);
    this.fps += (1 / Math.max(.001, rawDt) - this.fps) * .03;
    this.frameClock += dt;
    if (this.run.phase === 'flying') this.tickFlight(dt);
    else if (this.run.phase === 'ready') {
      this.ship.root.position.y = this.reducedMotion ? 0 : Math.sin(this.frameClock * .6) * .12;
      this.rocks.forEach(r => r.root.rotation.y += dt * .012);
    }
    this.cameraRig.update(this.camera, this.ship.root.position.x, this.flightY, dt);
    this.audio.setBoosting(this.run.phase==='flying' && this.boostTime>0);
    this.audio.setCutting(this.run.phase==='flying' && this.weapons.cutting);
    const blur=this.run.phase==='flying' && !this.reducedMotion ? boostEnvelope(this.boostTime) : 0;
    this.boostBlurPass.uniforms.strength.value=blur; this.boostBlurPass.enabled=blur>.001;
    for (const flame of this.ship.flames) flame.scale.y = (this.boostTime > 0 ? 1.8 : 1) * (.96 + Math.sin(this.frameClock * 30) * .065);
    if (this.expeditionProps.root.visible) {
      this.expeditionProps.drones.forEach((drone,i)=>{
        drone.position.set(this.ship.root.position.x+(i===0?-3.4:3.4),this.flightY+.5+(this.reducedMotion?0:Math.sin(this.flightClock*1.5+i)*.18),-1.8);
      });
      this.expeditionProps.beacon.visible=this.run.sectorTime>=60 || this.run.phase==='upgrade';
    }
    if (!document.hidden && (this.run.phase === 'ready' || this.run.phase === 'flying')) this.cosmos?.update(dt);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.uiClock += dt;
    if (this.uiClock > .055) { this.uiClock = 0; this.updateTarget(); this.hooks.update(this); }
    this.composer.render();
  }

  private tickFlight(dt: number): void {
    this.flightClock += dt; this.run.elapsed += dt; this.run.sectorTime += dt;
    this.ship.root.updateMatrixWorld();
    this.shipFrameStart.copy(this.ship.root.matrixWorld);
    this.invulnerable = Math.max(0, this.invulnerable - dt); this.boostDrive.update(dt,this.run.boostCooldown);
    this.weapons.recharge = cutterRecharge(this.run.levels.laser);
    this.weapons.update(dt);
    const axisX = horizontalInput(this.keys, this.touchMove.x);
    const axisY = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) + this.touchMove.y;
    const move = new T.Vector2(axisX, axisY); if (move.lengthSq() > 1) move.normalize();
    const speed = this.run.speed * (this.boostTime > 0 ? 2.2 : 1);
    this.velocity.lerp(move.multiplyScalar(speed), 1 - Math.exp(-dt * 7.5));
    const pos = this.ship.root.position;
    const rolling = this.roll.active, roll = this.roll.update(dt);
    pos.x = clamp(pos.x + this.velocity.x * dt * (rolling ? .5 : 1) + roll.lateral, -13.5, 13.5);
    this.flightY = clamp(this.flightY + this.velocity.y * dt, -6.5, 7);
    pos.y = this.flightY + (this.reducedMotion ? 0 : this.roll.height);
    this.bankAngle = T.MathUtils.lerp(this.bankAngle, clamp(-this.velocity.x * .033, -.42, .42), dt * 6);
    this.ship.root.rotation.z = this.bankAngle + (this.reducedMotion ? roll.bank : roll.angle);
    this.ship.root.rotation.x = T.MathUtils.lerp(this.ship.root.rotation.x, clamp(this.velocity.y * .02, -.22, .22), dt * 5);
    this.ship.root.rotation.y = T.MathUtils.lerp(this.ship.root.rotation.y, clamp(-this.velocity.x * .012, -.16, .16), dt * 5);
    this.ship.root.updateMatrixWorld();
    this.shipCollider.setMotion(this.shipFrameStart, this.ship.root.matrixWorld);
    if (this.flightClock - this.lastDamage > 5) this.run.shield = Math.min(this.run.maxShield, this.run.shield + dt * 4);
    const worldSpeed = this.forwardSpeed;
    for (const rock of this.rocks) {
      if (rock.wait > 0) { rock.wait -= dt; if (rock.wait <= 0) this.placeRock(rock); continue; }
      this.startPoint.copy(rock.root.position);
      (rock.previousPosition ??= new T.Vector3()).copy(rock.root.position);
      rock.root.position.z += worldSpeed * dt;
      rock.root.position.x += Math.sin(this.flightClock * .28 + rock.radius) * dt * (Math.min(this.run.sector,6) - 1) * .55;
      rock.root.rotation.x += rock.spin.x * dt; rock.root.rotation.y += rock.spin.y * dt;
      if (rock.root.position.z > 26) { this.placeRock(rock); continue; }
      if (this.invulnerable <= 0 && this.shipCollider.intersectsRock(this.startPoint, rock.root.position, rock.radius * .93)) {
        this.hurtShip((rock.kind === 'volatile' ? 42 : rock.kind === 'armored' ? 34 : 22) + rock.radius * 3,
          rock.kind === 'volatile' ? 'Взрывной астероид' : 'Столкновение');
        if (rock.kind === 'volatile') {
          const radius=blastRadius(rock.radius);
          this.effects.shockwave(rock.root.position,radius,0xff4f27);
          this.pirates.blast(rock.root.position,radius,100);
          this.boss.blast(rock.root.position,radius,100);
        }
        this.effects.burst(rock.root.position, new T.Color(1, .36, .08), 28, 8); this.hideRock(rock);
        if (this.run.hull <= 0) { this.finish(false); return; }
      }
    }
    if (shouldSpawnBoss(this.run.sector,this.run.sectorTime,this.run.mode) && !this.boss.active && !this.boss.defeated) {
      this.boss.spawn(this.run.sector);
      for (const rock of this.rocks) if (rock.wait<=0 && Math.abs(rock.root.position.x)<7 && rock.root.position.z<-12) {
        rock.root.position.x=rock.root.position.x<0?-12:12;
        rock.previousPosition?.copy(rock.root.position);
      }
      this.hooks.toast('Добывающий корабль · уходите с красной линии, бейте в открытый реактор');
    }
    const intersectsPlayer=(from:T.Vector3,to:T.Vector3,radius:number)=>this.shipCollider.intersectsRock(from,to,radius);
    this.boss.update(dt,{player:pos,rocks:this.rocks,worldSpeed,intersectsPlayer});
    this.pirates.update(dt,{sector:this.run.sector,sectorTime:this.run.sectorTime,elapsed:this.run.elapsed,player:pos,worldSpeed,rocks:this.rocks,bossActive:this.boss.active,intersectsPlayer});
    if (this.run.hull<=0) { this.finish(false); return; }
    for (const enemy of this.pirates.enemies) {
      if (!enemy.active || this.invulnerable>0) continue;
      if (this.shipCollider.intersectsRock(enemy.previousPosition ?? enemy.position,enemy.position,enemy.radius)) {
        this.hurtShip(32,'Столкновение с пиратом'); this.pirates.hit(enemy,enemy.hp);
        if (this.run.hull<=0) { this.finish(false); return; }
      }
    }
    this.updateTarget();
    const attack = this.weapons.fire(this.run.fireInterval, this.shooting, this.autoFire,
      (!!this.target && this.target.root.position.distanceTo(pos)<=CUTTER_RANGE+this.target.radius)
      || (!!this.combatTarget && this.combatTarget.position.distanceTo(pos)<=CUTTER_RANGE+this.combatTarget.radius && (this.combatTarget.kind!=='reactor' || this.boss.reactorOpen)));
    if (attack) this.fire(attack);
    this.projectiles.update(dt, this.rocks, this.run.damage, (rock, position, kind) => {
      this.effects.burst(position, kind === 'plasma' ? new T.Color(.5, .7, 2.5) : new T.Color(1.8, .65, .15), 5, 4);
      if (rock.kind === 'volatile' || rock.hp <= 0) this.breakRock(rock);
    }, position => {
      this.effects.shockwave(position, PLASMA_RADIUS, 0x977dff);
      this.effects.burst(position, new T.Color(.6, .4, 2.5), 24, 6);
    }, () => this.run.hull > 0, {targets:this.combatTargets(),hit:(target,damage,position)=>this.hitHostile(target,damage,position)});
    if (this.run.hull <= 0) { this.finish(false); return; }
    if (this.weapons.cutting) this.beam.update(this.ship.muzzles, this.nearestTarget(), this.rocks,
      (rock, direction) => this.breakRock(rock, direction), () => this.run.hull > 0,
      {targets:this.combatTargets(),hit:(target,damage,position)=>this.hitHostile(target,damage,position)}, BOSS_CUTTER_DPS*(this.run.damage/14)*dt);
    else this.beam.hide();
    if (this.run.hull <= 0) { this.finish(false); return; }
    this.salvage.update(dt, worldSpeed, this.ship.root.position, this.run.magnet, (value, position) => {
      collectOre(this.run, value);
      if (this.flightClock - this.lastPickupSound > .07) { this.audio.pickup(); this.lastPickupSound = this.flightClock; }
      this.effects.burst(position, new T.Color(1, .7, .24), 3, 1.5);
    });
    this.effects.update(dt);
    if (canAdvanceSector(this.run.sector,this.run.sectorTime,this.boss.defeated,this.run.mode)) {
      // A sector transfer finishes the tractor collection before the equipment bay opens.
      this.salvage.collectAll(value => collectOre(this.run, value));
      if (isExpeditionComplete(this.run.sector,this.run.sectorTime,this.boss.defeated,this.run.mode)) this.finish(true);
      else { this.run.phase = 'upgrade'; this.keys.clear(); this.fireInput.clear(); this.weapons.stopCutting(); this.beam.hide(); this.audio.setCutting(false); this.audio.setFlying(false); this.audio.upgrade(); this.hooks.phase(this); }
    }
  }

  private nearestTarget(): T.Vector3 {
    this.ray.setFromCamera(this.pointer, this.camera);
    this.aimPoint.copy(this.ray.ray.direction).multiplyScalar(220).add(this.ray.ray.origin);
    let nearest = Infinity;
    for (const rock of this.rocks) {
      if (rock.wait > 0 || rock.root.position.z > this.ship.root.position.z - 5) continue;
      this.raySphere.center.copy(rock.root.position); this.raySphere.radius = rock.radius * 1.02;
      const hit = this.ray.ray.intersectSphere(this.raySphere, this.tmp);
      if (hit) { const distance = hit.distanceToSquared(this.ray.ray.origin); if (distance < nearest) { nearest = distance; this.aimPoint.copy(hit); } }
    }
    for (const target of this.combatTargets()) {
      this.raySphere.center.copy(target.position); this.raySphere.radius=target.radius;
      const hit=this.ray.ray.intersectSphere(this.raySphere,this.tmp);
      if (hit) { const distance=hit.distanceToSquared(this.ray.ray.origin); if(distance<nearest) {nearest=distance;this.aimPoint.copy(hit);} }
    }
    return this.aimPoint;
  }

  private fire(weapon: WeaponId): void {
    if (weapon === 'cutter') { this.audio.cutter(); return; }
    this.projectiles.fire(this.ship.muzzles, this.nearestTarget(), this.run.multishot,
      { kind: weapon, damage: this.run.damage * (weapon === 'plasma' ? 2.5 : 1) });
    if (weapon === 'plasma') this.audio.plasma(); else this.audio.shot();
  }

  private breakRock(rock: Rock, cutDirection?: T.Vector3): void {
    if (rock.wait > 0 || this.run.hull <= 0) return;
    this.run.kills++;
    this.effects.burst(rock.root.position, new T.Color(1.3, .63, .19), 34, 9);
    this.effects.burst(rock.root.position, new T.Color(.24, .3, .38), 20, 5);
    const offset=rock.root.position.x-this.ship.root.position.x;
    const distance=rock.root.position.distanceTo(this.ship.root.position);
    this.audio.rock(rock.radius,offset/Math.max(16,distance*.35),distance);
    const source = rock.root.children[0] as T.Mesh;
    source.updateWorldMatrix(true, false);
    if (cutDirection && rock.kind !== 'volatile') {
      this.effects.slice(source, rock.root.position, cutDirection);
      this.effects.burst(rock.root.position, new T.Color(.5, 1.4, 1.8), 12, 4);
    } else this.effects.shatter(source, rock.root.position, rock.radius);
    this.salvage.drop(rock.root.position, rock.radius, rock.kind === 'normal' && rock.ore);
    this.hideRock(rock);
    if (rock.kind === 'volatile') {
      this.effects.shockwave(rock.root.position, blastRadius(rock.radius), 0xff4f27);
      this.pirates.blast(rock.root.position,blastRadius(rock.radius),100);
      this.boss.blast(rock.root.position,blastRadius(rock.radius),100);
      const damage = blastDamage(rock.radius, distance);
      if (damage > 0 && this.invulnerable <= 0) this.hurtShip(damage, 'Взрыв рядом с кораблём');
    }
  }
  private hurtShip(amount: number, reason: string): void {
    const shieldBefore = this.run.shield, hullBefore = this.run.hull;
    damageShip(this.run, amount); this.lastDamage = this.flightClock; this.invulnerable = 1.5; this.flash = 1;
    this.audio.hit();
    if (this.run.hull > 0) this.hooks.toast(`${reason} · ${hullBefore > this.run.hull ? `корпус −${Math.ceil(hullBefore - this.run.hull)}` : `щит −${Math.ceil(shieldBefore - this.run.shield)}`}`);
  }
  private hideRock(rock: Rock): void { rock.wait = 1.2 + this.rng() * 2; rock.root.visible = false; }

  private updateTarget(): void {
    this.target = null;
    this.combatTarget = null;
    if (this.run.phase !== 'flying') return;
    this.ray.setFromCamera(this.pointer, this.camera); let nearest = Infinity;
    for (const r of this.rocks) {
      if (r.wait > 0 || r.root.position.z > -5) continue;
      this.raySphere.center.copy(r.root.position); this.raySphere.radius = r.radius * 1.15;
      if (this.ray.ray.intersectSphere(this.raySphere, this.tmp)) {
        const distance = this.tmp.distanceToSquared(this.camera.position); if (distance < nearest) { nearest = distance; this.target = r; }
      }
    }
    for (const target of this.combatTargets()) {
      if (target.position.z>-5) continue;
      this.raySphere.center.copy(target.position); this.raySphere.radius=target.radius*1.08;
      if(this.ray.ray.intersectSphere(this.raySphere,this.tmp)) {
        const distance=this.tmp.distanceToSquared(this.camera.position);
        if(distance<nearest) {nearest=distance;this.target=null;this.combatTarget=target;}
      }
    }
  }
  targetScreen(): { x: number; y: number; health: number; ore: boolean; kind: Rock['kind'] | CombatTarget['kind']; label?: string } | null {
    if (this.combatTarget?.active) {
      const t=this.combatTarget;
      this.tmp2.copy(t.position); this.tmp2.y+=t.radius+1.6; this.tmp2.project(this.camera);
      return {x:(this.tmp2.x+1)/2*this.host.clientWidth,y:(1-this.tmp2.y)/2*this.host.clientHeight,health:t.hp/t.maxHp,ore:false,kind:t.kind,label:t.kind==='reactor'?(this.boss.reactorOpen?'РЕАКТОР ОТКРЫТ · РЕЗАК':'БРОНЯ ЗАКРЫТА'):t.label};
    }
    if (!this.target) return null;
    this.tmp2.copy(this.target.root.position); this.tmp2.y += this.target.radius + 1.6; this.tmp2.project(this.camera);
    return { x: (this.tmp2.x + 1) / 2 * this.host.clientWidth, y: (1 - this.tmp2.y) / 2 * this.host.clientHeight, health: this.target.hp / this.target.maxHp, ore: this.target.ore, kind: this.target.kind };
  }
  get dangerNearby(): boolean {
    return this.run.phase === 'flying' && this.rocks.some(rock => rock.wait <= 0 && rock.kind === 'volatile'
      && rock.root.position.z < 5 && rock.root.position.distanceTo(this.ship.root.position) < blastRadius(rock.radius) + 7);
  }
  get damageFlash(): number { return this.flash; }
  get oreCount(): number { return this.salvage.count; }
  private combatTargets(): CombatTarget[] {
    this.combatBuffer.length=0;
    for (const enemy of this.pirates.targets) this.combatBuffer.push(enemy);
    if (this.boss.bodyTarget) this.combatBuffer.push(this.boss.bodyTarget);
    return this.combatBuffer;
  }
  private hitHostile(target:CombatTarget,damage:number,position:T.Vector3): void {
    if (!target.active || this.run.hull<=0) return;
    if (target.kind==='reactor') this.boss.hit(target,damage); else this.pirates.hit(target,damage);
    this.effects.burst(position,new T.Color(1.6,.55,.15),damage<5?1:6,3);
  }
  private destroyPirate(enemy:Pirate): void {
    this.run.pirateKills++;
    this.effects.burst(enemy.position,new T.Color(2.4,.7,.12),32,8);
    this.effects.shockwave(enemy.position,5,0xffa04a);
    this.salvage.dropReward(enemy.position,enemy.kind==='sniper'?18:12,3);
    this.audio.rock(3.2,(enemy.position.x-this.ship.root.position.x)/24,enemy.position.distanceTo(this.ship.root.position));
  }
  private finish(won: boolean): void {
    this.run.phase = 'ended'; this.run.won = won; this.keys.clear(); this.touchMove.set(0, 0); this.fireInput.clear(); this.weapons.stopCutting(); this.beam.hide(); this.audio.setCutting(false); this.audio.setFlying(false); this.hooks.phase(this);
  }
}
