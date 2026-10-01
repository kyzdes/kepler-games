import * as T from 'three';
import type { Rock } from './asteroids';
import { mulberry32 } from './state';

interface Appearance { body: T.Mesh; ore: T.Object3D[]; cracks: T.Group; }

/** Shared materials and fixed decorations; respawning never allocates new geometry. */
export class AsteroidVisuals {
  private readonly normal: T.MeshStandardMaterial;
  private readonly volatile: T.MeshStandardMaterial;
  private readonly armored: T.MeshStandardMaterial;
  private readonly crackMaterial = new T.MeshBasicMaterial({ color: new T.Color(3.2, .12, .035), toneMapped: false });
  private readonly crackGeometry = new T.BoxGeometry(.035, .025, .30);
  private readonly appearances = new Map<T.Group, Appearance>();

  constructor(material: T.MeshStandardMaterial) {
    this.normal = material;
    this.volatile = material.clone();
    this.volatile.color.setHex(0x8a3028);
    this.volatile.emissive.setHex(0xb2190b);
    this.volatile.emissiveIntensity = .15;
    this.armored = material.clone();
    this.armored.color.setHex(0x344f64);
    this.armored.metalness = .82;
    this.armored.roughness = .35;
  }
  register(rock: Rock, seed: number): void {
    const body = rock.root.children[0] as T.Mesh;
    const ore = rock.root.children.slice(1);
    const cracks = new T.Group(), rng = mulberry32(seed);
    for (let i = 0; i < 7; i++) {
      const surface = new T.Vector3(rng() * 2 - 1, rng() * 2 - 1, .3 + rng()).normalize();
      const branch = new T.Group();
      branch.position.copy(surface).multiplyScalar(.94);
      branch.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), surface);
      for (let segment = 0; segment < 3; segment++) {
        const line = new T.Mesh(this.crackGeometry, this.crackMaterial);
        line.position.set((segment % 2 ? .035 : -.035), .025, (segment - 1) * .22);
        line.rotation.y = segment % 2 ? -.32 : .32;
        branch.add(line);
      }
      cracks.add(branch);
    }
    cracks.visible = false;
    rock.root.add(cracks);
    this.appearances.set(rock.root, { body, ore, cracks });
  }
  apply(rock: Rock): void {
    const visual = this.appearances.get(rock.root);
    if (!visual) return;
    visual.body.material = rock.kind === 'volatile' ? this.volatile : rock.kind === 'armored' ? this.armored : this.normal;
    visual.ore.forEach(detail => detail.visible = rock.kind === 'normal');
    visual.cracks.visible = rock.kind === 'volatile';
  }
}
