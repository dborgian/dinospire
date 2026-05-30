import { useEffect, useRef, useState } from 'react';
import { useRunStore } from '../../stores/runStore';
import { useCombatStore } from '../../stores/combatStore';
import { loadCards, loadEnemies, loadHeroes } from '../../game/content/index';
import type {
  NodeId,
  EnemyId,
  EnemyInstance,
  EnemyDefinition,
  CombatState,
} from '../../game/types';
import type { StartExtended, CombatActionExtended } from '../../game/combat/reducer';
import { buildRewardPool } from '../../game/run/rewards';
import { createSeededRng } from '../../game/rng';
import LoadingScreen from './LoadingScreen';
import { CombatScreen } from '../combat/CombatScreen';

interface CombatWrapperProps {
  nodeId: NodeId;
}

type WrapperState = 'loading' | 'ready' | 'error';

export default function CombatWrapper({ nodeId }: CombatWrapperProps) {
  const run = useRunStore((s) => s.run);
  const runDispatch = useRunStore((s) => s.dispatch);
  const clearRun = useRunStore((s) => s.clearRun);
  const { initCombat, clearCombat } = useCombatStore();
  const getCombat = useCombatStore((s) => s.combat);

  const [wrapperState, setWrapperState] = useState<WrapperState>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  // Prevent double-init on strict mode double-mount
  const initialised = useRef(false);

  useEffect(() => {
    if (!run || initialised.current) return;
    initialised.current = true;

    // Capture snapshot — run ref can change after this effect fires
    const snapshot = run;

    async function init() {
      const run = snapshot;

      // Find the node in the map
      const node = run.map.nodes.find((n) => n.id === nodeId);
      if (!node) {
        setErrorMsg(`Nodo ${nodeId} non trovato nella mappa.`);
        setWrapperState('error');
        return;
      }

      try {
        // Load enemy definitions for the current act
        const [enemyDefs, heroDefs] = await Promise.all([
          loadEnemies(run.act),
          loadHeroes(),
          loadCards(run.act),
        ]);

        const heroDef = heroDefs.find((h) => h.id === run.heroId);
        if (!heroDef) {
          setErrorMsg(`Definizione eroe ${run.heroId} non trovata.`);
          setWrapperState('error');
          return;
        }

        // Build EnemyInstance[] from the node's enemyIds
        const enemyIds = node.enemyIds ?? [];
        const defMap = new Map<string, EnemyDefinition>(enemyDefs.map((d) => [d.id, d]));

        const enemies: EnemyInstance[] = enemyIds.map((eid, idx) => {
          const def = defMap.get(eid);
          // Graceful degradation: if definition missing, create a dummy enemy
          const hp = def?.hp ?? 20;
          return {
            iid: `${eid}_${idx}` as EnemyId,
            definitionId: eid,
            hp,
            maxHp: hp,
            block: 0,
            statuses: {},
            currentMoveIndex: 0,
            nextIntent: def?.moves[0]?.intent ?? {
              type: 'unknown',
              description: '...',
            },
          };
        });

        const stage = run.evolutionStage;
        const heroStats = {
          energyMax: heroDef.stages[stage].energyPerTurn,
          handSize: heroDef.stages[stage].handSize,
          maxHp: run.maxHp,
        };

        // Build initial CombatState shell; the reducer START action fills the rest.
        // We create a minimal shell and rely on initCombat + dispatch START.
        const defMapTyped = new Map(
          enemyDefs.map((d) => [d.id, d])
        ) as ReadonlyMap<EnemyId, EnemyDefinition>;

        const initialShell: CombatState = {
          runId: run.id,
          nodeId,
          seed: run.seed,
          turn: 0,
          phase: 'player_turn',
          cardsPlayedThisTurn: 0,
          hero: {
            hp: run.hp,
            maxHp: run.maxHp,
            block: 0,
            energy: heroStats.energyMax,
            energyMax: heroStats.energyMax,
            handSize: heroStats.handSize,
            statuses: {},
            relics: run.relics,
            relicCounters: run.relicCounters,
          },
          enemies,
          piles: {
            draw: run.deck.map((c) => c.iid),
            hand: [],
            discard: [],
            exhaust: [],
          },
          cardInstances: Object.fromEntries(run.deck.map((c) => [c.iid, c])),
          log: [],
        };

        initCombat(initialShell);

        // Dispatch START to the combat reducer (shuffles draw pile + draws opening hand)
        const startAction: StartExtended = {
          type: 'START',
          nodeId,
          enemies,
          deck: run.deck,
          definitions: defMapTyped,
          heroStats,
        };

        // CombatStore.dispatch is typed for CombatAction; StartExtended is a structural
        // superset. The reducer reads the extended fields at runtime. Cast is safe.
        (useCombatStore.getState().dispatch as (a: CombatActionExtended) => void)(startAction);

        setWrapperState('ready');
      } catch (err) {
        console.error('[CombatWrapper] init error', err);
        setErrorMsg(err instanceof Error ? err.message : 'Errore sconosciuto');
        setWrapperState('error');
      }
    }

    void init();

    return () => {
      // Don't clear combat on unmount during strict mode re-mount; only clear after resolution
    };
  // run.id is stable for the lifetime of a run — correct dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, run?.id]);

  function handleVictory() {
    if (!run) return;

    const heroHpAfter = getCombat?.hero.hp ?? run.hp;
    const node = run.map.nodes.find((n) => n.id === nodeId);
    const nodeType = node?.type ?? 'combat';

    const deckCardIds = run.deck.map((c) => c.cardId);
    const rng = createSeededRng(run.seed ^ Date.now());

    const rewardPool = buildRewardPool(
      {
        nodeType,
        act: run.act,
        heroId: run.heroId,
        deckCardIds,
        relicPool: [],
        ascensionLevel: run.ascensionLevel,
        ownedRelics: run.relics,
      },
      rng,
    );

    clearCombat();
    runDispatch({
      type: 'COMBAT_VICTORY',
      rewards: rewardPool,
      statsDelta: { combatsWon: 1 },
      heroHpAfter,
    });
  }

  function handleDefeat() {
    const heroHpAfter = getCombat?.hero.hp ?? 0;
    clearCombat();
    runDispatch({ type: 'COMBAT_DEFEAT', heroHpAfter });
  }

  if (wrapperState === 'loading') return <LoadingScreen />;

  if (wrapperState === 'error') {
    return (
      <main className="min-h-screen bg-stone-950 flex flex-col items-center justify-center gap-4 p-8" role="main">
        <p className="text-red-400 font-bold text-lg">Errore caricamento combattimento</p>
        <p className="text-stone-500 text-sm font-mono">{errorMsg}</p>
        <button
          type="button"
          onClick={handleDefeat}
          className="bg-stone-800 text-stone-300 px-4 py-2 rounded-lg text-sm hover:bg-stone-700 cursor-pointer"
          aria-label="Torna alla mappa"
        >
          Torna alla mappa
        </button>
      </main>
    );
  }

  const currentNode = run?.map.nodes.find((n) => n.id === nodeId);
  const floorLabel = currentNode
    ? `Atto ${run?.act ?? 1} · Piano ${currentNode.floor + 1}`
    : `Atto ${run?.act ?? 1}`;

  function handleAbandon() {
    clearCombat();
    clearRun();
  }

  return (
    <CombatScreen
      onCombatEnd={(result) => result === 'victory' ? handleVictory() : handleDefeat()}
      onAbandon={handleAbandon}
      floorLabel={floorLabel}
      gold={run?.gold ?? 0}
      heroId={run?.heroId ?? 'borea'}
      relics={run?.relics ?? []}
    />
  );
}
