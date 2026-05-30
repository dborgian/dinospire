// ---------------------------------------------------------------------------
// Run store — Zustand slice for the active run state.
// Wraps the pure runReducer via immer for structural sharing.
// Persisted to sessionStorage (per-tab) so multiple browser tabs never share
// the same run state. sessionStorage survives page refreshes but not tab close,
// which is the correct crash-recovery granularity for a single-player game.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { RunAction } from '@/game/run/machine';
import { runReducer } from '@/game/run/machine';
import type { RunState } from '@/game/types';

interface RunStore {
  run: RunState | null;

  /** Dispatch an action through the run state machine. */
  dispatch: (action: RunAction) => void;

  /** Load an existing run (e.g. from IndexedDB on resume). */
  loadRun: (run: RunState) => void;

  /** Discard the current run (death / abandon). */
  clearRun: () => void;
}

export const useRunStore = create<RunStore>()(
  devtools(
    persist(
      immer((set) => ({
        run: null,

        dispatch(action) {
          set((state) => {
            if (action.type === 'START_RUN') {
              // START_RUN builds a fresh RunState — current state is ignored
              state.run = runReducer({} as RunState, action);
              return;
            }
            if (!state.run) return;
            state.run = runReducer(state.run, action);
          });
        },

        loadRun(run) {
          set((state) => {
            state.run = run;
          });
        },

        clearRun() {
          set((state) => {
            state.run = null;
          });
        },
      })),
      {
        name: 'dinospire-run',
        storage: createJSONStorage(() => sessionStorage),
      },
    ),
    { name: 'RunStore' },
  ),
);
