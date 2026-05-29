// ---------------------------------------------------------------------------
// BossReveal — Three.js scene that plays when the player reaches the boss node.
// Renders a dramatic animated dino silhouette before transitioning to combat.
// ---------------------------------------------------------------------------

"use client"; // React Three Fiber requires client-side rendering

import { useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Text3D } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { useUIStore } from "@/stores/uiStore";

// ---------------------------------------------------------------------------
// Inner scene (runs inside <Canvas>)
// ---------------------------------------------------------------------------

function BossModel() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    // Slow rotation for dramatic effect
    meshRef.current.rotation.y += delta * 0.3;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <mesh ref={meshRef} castShadow>
        {/* Placeholder geometry — replace with GLTF model when assets are ready */}
        <boxGeometry args={[1.5, 3, 1]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.6} />
      </mesh>
    </Float>
  );
}

function BossLabel({ name }: { readonly name: string }) {
  return (
    <Text3D
      font="/fonts/cinzel.json" // TODO: add Cinzel font JSON to public/fonts/
      size={0.4}
      height={0.05}
      position={[-1.8, -2.2, 0]}
    >
      {name}
      <meshStandardMaterial color="#fbbf24" />
    </Text3D>
  );
}

// ---------------------------------------------------------------------------
// Overlay canvas
// ---------------------------------------------------------------------------

interface BossRevealProps {
  /** Display name of the boss. */
  readonly bossName: string;
  /** Called when the reveal animation finishes and combat should begin. */
  readonly onComplete: () => void;
}

export function BossReveal({ bossName, onComplete }: BossRevealProps) {
  const active = useUIStore((s) => s.bossRevealActive);

  // Auto-dismiss after 3.5 s
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(onComplete, 3500);
    return () => clearTimeout(timer);
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          role="dialog"
          aria-label={`Boss encounter: ${bossName}`}
          aria-modal="true"
        >
          <div className="h-96 w-96">
            <Canvas
              camera={{ position: [0, 0, 6], fov: 45 }}
              aria-hidden="true"
            >
              <ambientLight intensity={0.3} />
              <pointLight position={[5, 5, 5]} intensity={2} color="#fbbf24" />
              <Environment preset="night" />
              <BossModel />
              <BossLabel name={bossName} />
            </Canvas>
          </div>

          <motion.p
            className="mt-6 font-mono text-2xl tracking-widest text-amber-400"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            {bossName.toUpperCase()}
          </motion.p>

          <motion.p
            className="mt-2 text-sm text-amber-400/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            Il Boss si avvicina&hellip;
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
