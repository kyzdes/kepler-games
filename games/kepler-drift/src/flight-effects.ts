import * as T from 'three';

interface Particle {
  position: T.Vector3;
  velocity: T.Vector3;
  life: number;
  maxLife: number;
  color: T.Color;
  size: number;
}

interface Fragment {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
}

const MAX_PARTICLES = 950;
const MAX_FRAGMENTS = 80;

/** Short-lived explosion visuals. Shared rock geometry/materials stay owned by the scene. */
export class FlightEffects {
  private readonly scene: T.Scene;
  private readonly rng: () => number;
  private readonly particles: Particle[] = [];
  private readonly fragments: Fragment[] = [];
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly sizes = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new T.BufferGeometry();

  constructor(scene: T.Scene, rng: () => number) {
    this.scene = scene;
    this.rng = rng;
    this.geometry.setAttribute('position', new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('color', new T.BufferAttribute(this.colors, 3).setUsage(T.DynamicDrawUsage));
    this.geometry.setAttribute('size', new T.BufferAttribute(this.sizes, 1).setUsage(T.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    const material = new T.ShaderMaterial({
      vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      vertexShader: 'attribute float size;varying vec3 vColor;void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*340./-p.z,1.,28.);gl_Position=projectionMatrix*p;}',
      fragmentShader: 'varying vec3 vColor;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(vColor,pow(1.-d*2.,1.5));}',
    });
    const points = new T.Points(this.geometry, material);
    points.frustumCulled = false;
    scene.add(points);
  }

  burst(position: T.Vector3, color: T.Color, count: number, speed: number): void {
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const life = .35 + this.rng() * .9;
      this.particles.push({
        position: position.clone(),
        velocity: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .5)
          .normalize().multiplyScalar(speed * (.2 + this.rng())),
        life, maxLife: life, color, size: .14 + this.rng() * .28,
      });
    }
  }

  shatter(source: T.Mesh, position: T.Vector3, radius: number): void {
    for (let i = 0; i < 5 && this.fragments.length < MAX_FRAGMENTS; i++) {
      const mesh = new T.Mesh(source.geometry, source.material);
      mesh.position.copy(position);
      mesh.scale.setScalar(radius * (.12 + this.rng() * .12));
      this.scene.add(mesh);
      this.fragments.push({
        mesh,
        velocity: new T.Vector3(this.rng() - .5, this.rng() - .5, this.rng() - .15)
          .normalize().multiplyScalar(4 + this.rng() * 5),
        life: 1.7 + this.rng(),
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.life -= dt;
      if (particle.life <= 0) { this.particles.splice(i, 1); continue; }
      particle.position.addScaledVector(particle.velocity, dt);
      particle.velocity.multiplyScalar(Math.exp(-dt * 1.5));
    }
    this.particles.forEach((particle, i) => {
      particle.position.toArray(this.positions, i * 3);
      const alpha = particle.life / particle.maxLife;
      this.colors[i * 3] = particle.color.r * alpha;
      this.colors[i * 3 + 1] = particle.color.g * alpha;
      this.colors[i * 3 + 2] = particle.color.b * alpha;
      this.sizes[i] = particle.size;
    });
    this.geometry.attributes.position.needsUpdate = this.geometry.attributes.color.needsUpdate = this.geometry.attributes.size.needsUpdate = true;
    this.geometry.setDrawRange(0, this.particles.length);

    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const fragment = this.fragments[i];
      fragment.life -= dt;
      fragment.mesh.position.addScaledVector(fragment.velocity, dt);
      fragment.mesh.rotation.x += dt;
      fragment.mesh.rotation.z += dt * .7;
      if (fragment.life < .7) fragment.mesh.scale.multiplyScalar(Math.exp(-dt * 3));
      if (fragment.life <= 0) {
        this.scene.remove(fragment.mesh);
        this.fragments.splice(i, 1);
      }
    }
  }

  reset(): void {
    this.particles.length = 0;
    this.geometry.setDrawRange(0, 0);
    for (const fragment of this.fragments) this.scene.remove(fragment.mesh);
    this.fragments.length = 0;
  }
}
