import { useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HitBurst {
  id: number;
  /** Viewport fraction 0..1 (left → right) */
  nx: number;
  /** Viewport fraction 0..1 (top → bottom) */
  ny: number;
  /** Date.now() / 1000 at burst creation */
  startTime: number;
}

export const MAX_BURSTS = 3;

// ---------------------------------------------------------------------------
// Module-level particle data — allocated once, never GC'd inside render loop
// ---------------------------------------------------------------------------

const PER_BURST = 280;
const TOTAL = MAX_BURSTS * PER_BURST;
const DURATION = 0.65; // seconds

const _angles  = new Float32Array(TOTAL);
const _speeds  = new Float32Array(TOTAL);
const _scales  = new Float32Array(TOTAL);
const _offsets = new Float32Array(TOTAL); // per-particle time stagger

for (let i = 0; i < TOTAL; i++) {
  _angles[i]  = Math.random() * Math.PI * 2;
  _speeds[i]  = 0.6 + Math.random() * 2.2;
  _scales[i]  = 0.35 + Math.random() * 0.65;
  _offsets[i] = Math.random() * 0.05;
}

// Reusable scratch objects — never allocated inside useFrame
const _dummy = new THREE.Object3D();
const _color  = new THREE.Color();

// ---------------------------------------------------------------------------
// Inner R3F scene
// ---------------------------------------------------------------------------

interface SceneProps {
  burstsRef: React.RefObject<HitBurst[]>;
}

function ParticleScene({ burstsRef }: SceneProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Pre-hide all instances on mount so there's no one-frame flash at origin
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    _dummy.position.set(0, -9999, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < TOTAL; i++) mesh.setMatrixAt(i, _dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Use current viewport world-unit dimensions (updates on resize)
    const { viewport } = state;
    const W = viewport.width;
    const H = viewport.height;

    const bursts = burstsRef.current;
    const now = Date.now() / 1000;

    for (let b = 0; b < MAX_BURSTS; b++) {
      const burst = bursts[b] ?? null;
      const base  = b * PER_BURST;

      for (let p = 0; p < PER_BURST; p++) {
        const idx = base + p;

        // No active burst for this slot → park particle off-screen
        if (!burst) {
          _dummy.position.set(0, -9999, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          mesh.setMatrixAt(idx, _dummy.matrix);
          continue;
        }

        const t = Math.max(0, now - burst.startTime - (_offsets[idx] ?? 0));

        if (t > DURATION) {
          _dummy.position.set(0, -9999, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          mesh.setMatrixAt(idx, _dummy.matrix);
          continue;
        }

        const progress = t / DURATION;
        const fade = 1 - progress * progress; // quadratic ease-out

        // Impact point in world coords
        const cx = (burst.nx - 0.5) * W;
        const cy = (0.5 - burst.ny) * H;

        // Radial burst with downward gravity
        const angle = _angles[idx] ?? 0;
        const spd   = _speeds[idx] ?? 1;
        const px = cx + Math.cos(angle) * spd * t;
        const py = cy + Math.sin(angle) * spd * t - 2.5 * t * t;

        _dummy.position.set(px, py, 0);
        _dummy.scale.setScalar(Math.max(0.0001, (_scales[idx] ?? 0.5) * 0.08 * fade));
        _dummy.updateMatrix();
        mesh.setMatrixAt(idx, _dummy.matrix);

        // Hot orange → red as burst ages
        _color.setHSL(0.08 - progress * 0.07, 1.0, 0.5 * fade + 0.1);
        mesh.setColorAt(idx, _color);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, TOTAL]}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Exported overlay component — mount once in CombatScreen
// ---------------------------------------------------------------------------

interface EnemyHitParticlesProps {
  burstsRef: React.RefObject<HitBurst[]>;
}

export function EnemyHitParticles({ burstsRef }: EnemyHitParticlesProps) {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 25 }}
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ alpha: true, antialias: false }}
        style={{ background: "transparent" }}
      >
        <ParticleScene burstsRef={burstsRef} />
      </Canvas>
    </div>
  );
}
