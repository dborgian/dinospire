import { motion } from 'framer-motion';

export default function LoadingScreen() {
  return (
    <div
      className="min-h-screen bg-stone-950 flex items-center justify-center"
      role="status"
      aria-label="Caricamento DinoSpire"
    >
      <motion.p
        className="text-amber-400 font-mono text-xl tracking-widest select-none"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        DINOSPIRE
      </motion.p>
    </div>
  );
}
