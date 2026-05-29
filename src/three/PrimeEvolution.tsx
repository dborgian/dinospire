// ---------------------------------------------------------------------------
// PrimeEvolution — Three.js particle burst + hero model swap when the hero
// reaches Prime stage (final evolution). Triggered by primeEvolutionActive.
// ---------------------------------------------------------------------------

"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { useUIStore } from "@/stores/uiStore";

// ---------------------------------------------------------------------------
// Particle system (inside Canvas)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 600;

function EvolutionParticles() {
  const pointsRef = useRef<THREE.Points>(null);

  // Pre-generate random positions around origin
  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 8;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    return arr;
  }, []);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.5;
    pointsRef.current.rotation.x += delta * 0.2;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#fbbf24"
        transparent
        opacity={0.85}
        sizeAttenuation
      />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Overlay component
// ---------------------------------------------------------------------------

interface PrimeEvolutionProps {
  /** Hero name to display in the evolution banner. */
  readonly heroName: string;
  /** Called when the animation finishes. */
  readonly onComplete: () => void;
}

export function PrimeEvolution({ heroName, onComplete }: PrimeEvolutionProps) {
  const active = useUIStore((s) => s.primeEvolutionActive);

  // Auto-dismiss after 4 s
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          role="dialog"
          aria-label={`${heroName} ha raggiunto la forma Prime!`}
          aria-modal="true"
        >
          {/* Particle canvas — decorative, hidden from screen readers */}
          <div className="absolute inset-0" aria-hidden="true">
            <Canvas camera={{ position: [0, 0, 8], fov: 60 }}>
              <ambientLight intensity={0.1} />
              <pointLight position={[0, 0, 4]} intensity={4} color="#fbbf24" />
              <EvolutionParticles />
            </Canvas>
          </div>

          {/* Text overlay */}
          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
            <motion.p
              className="font-mono text-sm uppercase tracking-[0.4em] text-amber-300/80"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Evoluzione
            </motion.p>

            <motion.h2
              className="font-mono text-5xl font-bold tracking-widest text-amber-400"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
            >
              {heroName.toUpperCase()}
            </motion.h2>

            <motion.p
              className="font-mono text-xl tracking-[0.3em] text-amber-300"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
            >
              FORMA PRIME
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
