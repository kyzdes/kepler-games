import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createEnvironment } from './environment';
import type { SpaceEnvironment } from './environment';
import { createShip, createRock, rockGeometry, crystal } from './models';
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
import { createRun, clamp, damageShip, collectOre, segmentSphereHit, mulberry32, asteroidOre, splitOre, flightSpeed, SECTOR_SECONDS, TOTAL_SECTORS } from './state';
import type { Run } from './state';

interface Rock { root: T.Group; radius: number; hp: number; maxHp: number; ore: boolean; spin: T.Vector3; wait: number; }
interface Bullet { mesh: T.Mesh; velocity: T.Vector3; life: number; }
interface Ore { mesh: T.Mesh; velocity: T.Vector3; life: number; value: number; }
interface Particle { position: T.Vector3; velocity: T.Vector3; life: number; maxLife: number; color: T.Color; size: number; }
export interface GameHooks { update(game: Game): void; phase(game: Game): void; toast(text: string): void; help(): void; sound(muted: boolean): void; }

const UP = new T.Vector3(0, 1, 0);
const MAX_PARTICLES = 950;

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
  readonly pointer = new T.Vector2(0, 0);
  readonly touchMove = new T.Vector2();
  readonly velocity = new T.Vector2();
  readonly keys = new Set<string>();
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private bullets: Bullet[] = [];
  private ores: Ore[] = [];
  private fragments: Bullet[] = [];
  private particles: Particle[] = [];
  private particlePositions = new Float32Array(MAX_PARTICLES * 3);
  private particleColors = new Float32Array(MAX_PARTICLES * 3);
  private particleSizes = new Float32Array(MAX_PARTICLES);
  private particleGeo = new T.BufferGeometry();
  private cosmos: SpaceEnvironment | null = null;
  private ray = new T.Raycaster();
  private shotGeometry = new T.CylinderGeometry(.038, .065, 2.4, 6);
  private shotMaterial = new T.MeshBasicMaterial({ color: new T.Color(5, 1.6, .35), toneMapped: false });
  private rng = mulberry32(Date.now());
  private lastFrame = 0;
  private flightClock = 0;
  private frameClock = 0;
  private uiClock = 0;
  private shotClock = 0;
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
  private targetPoint = new T.Vector3();
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
  get forwardSpeed(): number { return flightSpeed(this.run.sector, this.run.sectorTime) * (this.boostTime > 0 ? BOOST_FORWARD_MULTIPLIER : 1); }
  target: Rock | null = null;
  loaded = false;
  fps = 60;

  constructor(private host: HTMLElement, private hooks: GameHooks) {
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.touchDevice ? 1.25 : 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
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
    this.prepareParticles();
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
      onProgress({ percent:12 + ++texturesLoaded / urls.length * 24, stage:0, label:'Загружаем миры трёх секторов' });
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
      const rock: Rock = { root, radius, hp, maxHp: hp, ore: isOre, spin: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .5).multiplyScalar(.13), wait: 0 };
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
    rock.maxHp = (12 + rock.radius * 8) * (1 + (this.run.sector - 1) * .28);
    rock.wait = 0; rock.hp = rock.maxHp; rock.root.visible = true;
  }

  start(): void {
    this.run = createRun(); this.run.phase = 'flying';
    this.autoFire = true; this.roll.reset(); this.bankAngle = 0;
    this.flightY = 0;
    this.cosmos?.setSector(1);
    this.rng = mulberry32(Date.now());
    this.ship.root.position.set(0, 0, 0); this.ship.root.rotation.set(0, 0, 0);
    this.cameraRig.reset(this.camera);
    this.velocity.set(0, 0); this.touchMove.set(0, 0); this.pointer.set(0, 0); this.keys.clear(); this.fireInput.clear();
    this.boostDrive.reset(); this.boostBlurPass.enabled=false;
    this.flightClock = this.shotClock = this.invulnerable = 0; this.lastDamage = -20; this.flash = 0;
    this.bullets.forEach(b => this.scene.remove(b.mesh)); this.bullets = [];
    this.ores.forEach(o => this.scene.remove(o.mesh)); this.ores = []; this.particles = [];
    this.fragments.forEach(f => this.scene.remove(f.mesh)); this.fragments = [];
    this.rocks.forEach((rock, i) => this.placeRock(rock, true, i));
    this.audio.start(); this.audio.setFlying(true);
    this.hooks.phase(this); this.hooks.toast('Держите курс. Золотые жилы содержат руду.');
    this.renderer.domElement.focus({ preventScroll: true });
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
    this.run.sector++; this.run.sectorTime = 0; this.run.phase = 'flying';
    this.cosmos?.setSector(this.run.sector);
    this.run.shield = this.run.maxShield;
    this.rocks.forEach(r => { if (r.root.position.z > -45) this.placeRock(r); });
    this.bullets.forEach(b => this.scene.remove(b.mesh)); this.bullets = [];
    this.keys.clear(); this.fireInput.clear(); this.audio.setFlying(true); this.hooks.phase(this); this.hooks.toast(`Сектор ${this.run.sector}. Плотность астероидов растёт.`);
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
    const blur=this.run.phase==='flying' && !this.reducedMotion ? boostEnvelope(this.boostTime) : 0;
    this.boostBlurPass.uniforms.strength.value=blur; this.boostBlurPass.enabled=blur>.001;
    for (const flame of this.ship.flames) flame.scale.y = (this.boostTime > 0 ? 1.8 : 1) * (.96 + Math.sin(this.frameClock * 30) * .065);
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
      rock.root.position.z += worldSpeed * dt;
      rock.root.position.x += Math.sin(this.flightClock * .28 + rock.radius) * dt * (this.run.sector - 1) * .55;
      rock.root.rotation.x += rock.spin.x * dt; rock.root.rotation.y += rock.spin.y * dt;
      if (rock.root.position.z > 26) { this.placeRock(rock); continue; }
      if (this.invulnerable <= 0 && this.shipCollider.intersectsRock(this.startPoint, rock.root.position, rock.radius * .93)) {
        const shieldBefore = this.run.shield, hullBefore = this.run.hull;
        damageShip(this.run, 22 + rock.radius * 3); this.lastDamage = this.flightClock; this.invulnerable = 1.5; this.flash = 1;
        this.burst(rock.root.position, new T.Color(1, .36, .08), 28, 8); this.audio.hit(); this.hideRock(rock);
        if (this.run.phase === 'ended') { this.finish(false); return; }
        const hullLost = Math.ceil(hullBefore - this.run.hull), shieldLost = Math.ceil(shieldBefore - this.run.shield);
        this.hooks.toast(hullLost > 0
          ? `Корпус −${hullLost} · щит исчерпан`
          : `Щит −${shieldLost} · ${this.run.shield > 0 ? 'столкновение' : 'защита исчерпана'}`);
      }
    }
    this.shotClock -= dt;
    if ((this.shooting || this.autoFire) && this.shotClock <= 0) { this.fire(); this.shotClock = this.run.fireInterval; }
    this.tickBullets(dt);
    this.tickOre(dt, worldSpeed);
    this.tickParticles(dt);
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i]; f.life -= dt; f.mesh.position.addScaledVector(f.velocity, dt); f.mesh.rotation.x += dt; f.mesh.rotation.z += dt * .7;
      if (f.life < .7) f.mesh.scale.multiplyScalar(Math.exp(-dt * 3));
      if (f.life <= 0) { this.scene.remove(f.mesh); this.fragments.splice(i, 1); }
    }
    if (this.run.sectorTime >= SECTOR_SECONDS) {
      // A sector transfer finishes the tractor collection before the equipment bay opens.
      this.ores.forEach(o => { collectOre(this.run, o.value); this.scene.remove(o.mesh); }); this.ores = [];
      if (this.run.sector === TOTAL_SECTORS) this.finish(true);
      else { this.run.phase = 'upgrade'; this.keys.clear(); this.fireInput.clear(); this.audio.setFlying(false); this.audio.upgrade(); this.hooks.phase(this); }
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
    return this.aimPoint;
  }

  private fire(): void {
    this.nearestTarget();
    for (const muzzle of this.ship.muzzles) {
      muzzle.getWorldPosition(this.startPoint);
      const spreads = this.run.multishot ? [-.032, 0, .032] : [0];
      for (const spread of spreads) {
        const direction = this.aimPoint.clone().sub(this.startPoint).normalize(); direction.x += spread; direction.normalize();
        const bullet = new T.Mesh(this.shotGeometry, this.shotMaterial); bullet.position.copy(this.startPoint); bullet.quaternion.setFromUnitVectors(UP, direction); this.scene.add(bullet);
        this.bullets.push({ mesh: bullet, velocity: direction.multiplyScalar(160), life: 1.8 });
      }
    }
    this.audio.shot();
  }

  private tickBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; b.life -= dt;
      this.startPoint.copy(b.mesh.position); this.targetPoint.copy(this.startPoint).addScaledVector(b.velocity, dt);
      let hit: Rock | null = null, nearest = 2;
      for (const rock of this.rocks) {
        if (rock.wait > 0) continue;
        const p = rock.root.position;
        const t = segmentSphereHit(this.startPoint.x, this.startPoint.y, this.startPoint.z, this.targetPoint.x, this.targetPoint.y, this.targetPoint.z, p.x, p.y, p.z, rock.radius * .93);
        if (t !== null && t < nearest) { nearest = t; hit = rock; }
      }
      if (hit) {
        hit.hp -= this.run.damage; this.tmp.copy(this.startPoint).lerp(this.targetPoint, nearest);
        this.burst(this.tmp, new T.Color(1.8, .65, .15), 5, 4); b.life = 0;
        if (hit.hp <= 0) this.breakRock(hit);
      }
      b.mesh.position.copy(this.targetPoint);
      if (b.life <= 0) { this.scene.remove(b.mesh); this.bullets.splice(i, 1); }
    }
  }

  private breakRock(rock: Rock): void {
    this.run.kills++;
    this.burst(rock.root.position, new T.Color(1.3, .63, .19), 34, 9);
    this.burst(rock.root.position, new T.Color(.24, .3, .38), 20, 5);
    const offset=rock.root.position.x-this.ship.root.position.x;
    const distance=rock.root.position.distanceTo(this.ship.root.position);
    this.audio.rock(rock.radius,offset/Math.max(16,distance*.35),distance);
    const source = rock.root.children[0] as T.Mesh;
    for (let i = 0; i < 5 && this.fragments.length < 80; i++) {
      const fragment = new T.Mesh(source.geometry, source.material); fragment.position.copy(rock.root.position); fragment.scale.setScalar(rock.radius * (.12 + this.rng() * .12)); this.scene.add(fragment);
      this.fragments.push({ mesh: fragment, velocity: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .15).normalize().multiplyScalar(4 + this.rng() * 5), life: 1.7 + this.rng() });
    }
    const reward = asteroidOre(rock.radius, rock.ore);
    const values = splitOre(reward, Math.min(5, Math.ceil(rock.radius), 150 - this.ores.length));
    // Keep the reward when the visual pool is full: merge it into the nearest
    // existing ore cluster rather than awarding extra ore or discarding it.
    if (!values.length && this.ores.length) {
      const nearest = this.ores.reduce((a, b) => a.mesh.position.distanceToSquared(rock.root.position) < b.mesh.position.distanceToSquared(rock.root.position) ? a : b);
      nearest.value += reward; nearest.life = Math.max(nearest.life, 18);
    }
    for (const value of values) {
      const ore = crystal(); ore.scale.set(.19, .34 + this.rng() * .19, .22);
      ore.position.copy(rock.root.position).add(this.tmp.set(this.rng() - .5, this.rng() - .5, this.rng() - .5).multiplyScalar(rock.radius * 1.1));
      this.scene.add(ore);
      this.ores.push({ mesh: ore, velocity: new T.Vector3((this.rng() - .5) * 3, (this.rng() - .5) * 3, 3 + this.rng() * 4), life: 18, value });
    }
    this.hideRock(rock);
  }
  private hideRock(rock: Rock): void { rock.wait = 1.2 + this.rng() * 2; rock.root.visible = false; }

  private tickOre(dt: number, worldSpeed: number): void {
    for (let i = this.ores.length - 1; i >= 0; i--) {
      const ore = this.ores[i]; ore.life -= dt;
      this.tmp.copy(this.ship.root.position).sub(ore.mesh.position); const distance = this.tmp.length();
      if (distance < this.run.magnet) ore.velocity.lerp(this.tmp.normalize().multiplyScalar(22 + (this.run.magnet - distance) * 1.2), 1 - Math.exp(-dt * 4));
      else ore.velocity.z += (worldSpeed - ore.velocity.z) * dt * .5;
      ore.mesh.position.addScaledVector(ore.velocity, dt); ore.mesh.rotation.y += dt * 2; ore.mesh.rotation.z += dt * .65;
      if (distance < 1.6) {
        collectOre(this.run, ore.value);
        if (this.flightClock - this.lastPickupSound > .07) { this.audio.pickup(); this.lastPickupSound = this.flightClock; }
        this.burst(ore.mesh.position, new T.Color(1, .7, .24), 3, 1.5); ore.life = 0;
      }
      if (ore.life <= 0 || ore.mesh.position.z > 25) { this.scene.remove(ore.mesh); this.ores.splice(i, 1); }
    }
  }

  private prepareParticles(): void {
    this.particleGeo.setAttribute('position', new T.BufferAttribute(this.particlePositions, 3).setUsage(T.DynamicDrawUsage));
    this.particleGeo.setAttribute('color', new T.BufferAttribute(this.particleColors, 3).setUsage(T.DynamicDrawUsage));
    this.particleGeo.setAttribute('size', new T.BufferAttribute(this.particleSizes, 1).setUsage(T.DynamicDrawUsage));
    this.particleGeo.setDrawRange(0, 0);
    const m = new T.ShaderMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      vertexShader: 'attribute float size;varying vec3 vColor;void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*340./-p.z,1.,28.);gl_Position=projectionMatrix*p;}',
      fragmentShader: 'varying vec3 vColor;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(vColor,pow(1.-d*2.,1.5));}' });
    const particles = new T.Points(this.particleGeo, m); particles.frustumCulled = false; this.scene.add(particles);
  }
  private burst(position: T.Vector3, color: T.Color, count: number, speed: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const life = .35 + this.rng() * .9;
      this.particles.push({ position: position.clone(), velocity: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .5).normalize().multiplyScalar(speed * (.2 + this.rng())), life, maxLife: life, color, size: .14 + this.rng() * .28 });
    }
  }
  private tickParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.position.addScaledVector(p.velocity, dt); p.velocity.multiplyScalar(Math.exp(-dt * 1.5));
    }
    this.particles.forEach((p, i) => {
      p.position.toArray(this.particlePositions, i * 3); const alpha = p.life / p.maxLife;
      this.particleColors[i * 3] = p.color.r * alpha; this.particleColors[i * 3 + 1] = p.color.g * alpha; this.particleColors[i * 3 + 2] = p.color.b * alpha; this.particleSizes[i] = p.size;
    });
    this.particleGeo.attributes.position.needsUpdate = this.particleGeo.attributes.color.needsUpdate = this.particleGeo.attributes.size.needsUpdate = true;
    this.particleGeo.setDrawRange(0, this.particles.length);
  }

  private updateTarget(): void {
    this.target = null;
    if (this.run.phase !== 'flying') return;
    this.ray.setFromCamera(this.pointer, this.camera); let nearest = Infinity;
    for (const r of this.rocks) {
      if (r.wait > 0 || r.root.position.z > -5) continue;
      this.raySphere.center.copy(r.root.position); this.raySphere.radius = r.radius * 1.15;
      if (this.ray.ray.intersectSphere(this.raySphere, this.tmp)) {
        const distance = this.tmp.distanceToSquared(this.camera.position); if (distance < nearest) { nearest = distance; this.target = r; }
      }
    }
  }
  targetScreen(): { x: number; y: number; health: number; ore: boolean } | null {
    if (!this.target) return null;
    this.tmp2.copy(this.target.root.position); this.tmp2.y += this.target.radius + 1.6; this.tmp2.project(this.camera);
    return { x: (this.tmp2.x + 1) / 2 * this.host.clientWidth, y: (1 - this.tmp2.y) / 2 * this.host.clientHeight, health: this.target.hp / this.target.maxHp, ore: this.target.ore };
  }
  get damageFlash(): number { return this.flash; }
  get oreCount(): number { return this.ores.length; }
  private finish(won: boolean): void {
    this.run.phase = 'ended'; this.run.won = won; this.keys.clear(); this.touchMove.set(0, 0); this.fireInput.clear(); this.audio.setFlying(false); this.hooks.phase(this);
  }
}
