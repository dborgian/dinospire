// ---------------------------------------------------------------------------
// EnemyHitParticles — vanilla Three.js particle burst on enemy hit.
// Uses a plain <canvas> + requestAnimationFrame, bypassing R3F entirely.
// R3F v8 + React 19 conflict: ReactCurrentBatchConfig internals changed.
// ---------------------------------------------------------------------------

import { useRef, useEffect } from "react";
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
// Module-level particle data — allocated once, never GC'd in the render loop
// ---------------------------------------------------------------------------

const PER_BURST = 280;
const TOTAL     = MAX_BURSTS * PER_BURST;
const DURATION  = 0.65; // seconds per burst
const CAM_Z     = 5;
const CAM_FOV   = 50; // degrees

const _angles  = new Float32Array(TOTAL);
const _speeds  = new Float32Array(TOTAL);
const _scales  = new Float32Array(TOTAL);
const _offsets = new Float32Array(TOTAL);

for (let i = 0; i < TOTAL; i++) {
  _angles[i]  = Math.random() * Math.PI * 2;
  _speeds[i]  = 0.6 + Math.random() * 2.2;
  _scales[i]  = 0.35 + Math.random() * 0.65;
  _offsets[i] = Math.random() * 0.05;
}

// Scratch objects — never allocated inside the loop
const _dummy = new THREE.Object3D();
const _color  = new THREE.Color();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EnemyHitParticlesProps {
  burstsRef: React.RefObject<HitBurst[]>;
}

export function EnemyHitParticles({ burstsRef }: EnemyHitParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Three.js bootstrap ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setClearColor(0x000000, 0);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAM_Z);

    // InstancedMesh: 840 spheres, one draw call per frame
    const geo  = new THREE.SphereGeometry(1, 5, 5);
    const mat  = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, TOTAL);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    // Pre-hide all instances so there's no flash on first frame
    _dummy.position.set(0, -9999, 0);
    _dummy.scale.setScalar(0.001);
    _dummy.updateMatrix();
    for (let i = 0; i < TOTAL; i++) mesh.setMatrixAt(i, _dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;

    // ── Viewport world dimensions (updated on resize) ──────────────────────
    let vpW = 1;
    let vpH = 1;

    function updateViewport(w: number, h: number) {
      // Buffer size (false = don't update canvas CSS, handled by Tailwind inset-0)
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(window.devicePixelRatio);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // World-unit extents at z=0 for this camera
      const halfFov = (CAM_FOV / 2) * (Math.PI / 180);
      vpH = 2 * Math.tan(halfFov) * CAM_Z;
      vpW = vpH * (w / h);
    }

    updateViewport(window.innerWidth, window.innerHeight);

    const onResize = () => updateViewport(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", onResize);

    // ── Animation loop — fully outside React ───────────────────────────────
    let rafId = 0;

    function tick() {
      rafId = requestAnimationFrame(tick);

      const bursts = burstsRef.current;
      const now    = Date.now() / 1000;

      for (let b = 0; b < MAX_BURSTS; b++) {
        const burst = bursts[b] ?? null;
        const base  = b * PER_BURST;

        for (let p = 0; p < PER_BURST; p++) {
          const idx = base + p;

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
          const fade     = 1 - progress * progress; // quadratic ease-out

          // Burst center in world coords
          const cx = (burst.nx - 0.5) * vpW;
          const cy = (0.5 - burst.ny) * vpH;

          // Radial explosion + downward gravity
          const angle = _angles[idx] ?? 0;
          const spd   = _speeds[idx] ?? 1;

          _dummy.position.set(
            cx + Math.cos(angle) * spd * t,
            cy + Math.sin(angle) * spd * t - 2.5 * t * t,
            0,
          );
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

      renderer.render(scene, camera);
    }

    tick();

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, []); // burstsRef is a stable ref object — safe to omit from deps

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none w-full h-full"
      style={{ zIndex: 25 }}
      aria-hidden="true"
    />
  );
}
