// ---------------------------------------------------------------------------
// Map generation — builds a deterministic ActMap for a given act + seed.
// Act 1 uses a fixed 8-floor layout with randomised enemy assignments.
// Acts 2–3 use the original procedural generation (more floors, branching).
// ---------------------------------------------------------------------------

import type { ActMap, MapNode, NodeId, NodeType, EnemyId, EventId } from '@/game/types';
import { createSeededRng } from '@/game/rng';

// ---------------------------------------------------------------------------
// Act 1 — fixed 13-floor layout (extended from original 8)
// ---------------------------------------------------------------------------
//
//  Floor 0  (start) : 1 × combat (tutorial)
//  Floor 1          : 2 × combat (parallel)
//  Floor 2          : 1 × event
//  Floor 3          : 2 × combat (parallel)
//  Floor 4          : 1 × event
//  Floor 5          : 2 × combat (parallel)
//  Floor 6          : 1 × elite
//  Floor 7          : 1 × rest
//  Floor 8          : 1 × growth (forced evolution)
//  Floor 9          : 2 × combat (parallel)
//  Floor 10         : 1 × event
//  Floor 11         : 1 × rest
//  Floor 12 (boss)  : 1 × boss  (nodeId always 'boss_act1')
//

interface FloorSpec {
  readonly floor: number;
  readonly slots: NodeType[];
}

const ACT1_FLOORS: readonly FloorSpec[] = [
  { floor: 0,  slots: ['combat'] },
  { floor: 1,  slots: ['combat', 'combat'] },
  { floor: 2,  slots: ['event'] },
  { floor: 3,  slots: ['combat', 'combat'] },
  { floor: 4,  slots: ['event'] },
  { floor: 5,  slots: ['combat', 'combat'] },
  { floor: 6,  slots: ['elite'] },
  { floor: 7,  slots: ['rest'] },
  { floor: 8,  slots: ['growth'] },
  { floor: 9,  slots: ['combat', 'combat'] },
  { floor: 10, slots: ['event'] },
  { floor: 11, slots: ['rest'] },
  { floor: 12, slots: ['boss'] },
];

const ACT1_BOSS_FLOOR = 12;

// Normal-tier enemy pool for act 1 (referenced by EnemyDefinition ids in act1.json)
const ACT1_NORMAL_ENEMIES: readonly EnemyId[] = [
  'compy_sciame' as EnemyId,
  'dilophosaurus' as EnemyId,
  'pachycephalosaurus' as EnemyId,
  'triceratops_giovane' as EnemyId,
  'ankylosaurus' as EnemyId,
  'pterodactyl' as EnemyId,
  'iguanodon' as EnemyId,
];

const ACT1_ELITE_ENEMIES: readonly EnemyId[] = [
  'utahraptor_coppia' as EnemyId,
  'spinosauro_alpha' as EnemyId,
];

const ACT1_BOSS_ENEMY: EnemyId = 'carnotaurus_boss' as EnemyId;

const ACT1_EVENTS: readonly EventId[] = [
  'uovo_misterioso' as EventId,
  'pozza_catrame' as EventId,
  'branco_errante' as EventId,
  'roccia_cretacea' as EventId,
  'fontana_fossile' as EventId,
  'fossile_antico' as EventId,
  'tempesta_cretacea' as EventId,
  'mercante_ombra' as EventId,
];

function buildAct1Nodes(seed: number): MapNode[] {
  const rng = createSeededRng(seed);
  const nodes: MapNode[] = [];

  // Shuffle events once per run so each event appears at most once before
  // the pool wraps (4 event nodes vs 8 events → no repeats expected).
  const shuffledEvents = rng.shuffle(ACT1_EVENTS) as EventId[];
  let eventCursor = 0;
  const nextEvent = (): EventId => {
    const e = shuffledEvents[eventCursor % shuffledEvents.length] as EventId;
    eventCursor += 1;
    return e;
  };

  for (const { floor, slots } of ACT1_FLOORS) {
    for (let col = 0; col < slots.length; col++) {
      const type = slots[col] as NodeType;
      const id = (floor === ACT1_BOSS_FLOOR ? 'boss_act1' : `1-${floor}-${col}`) as NodeId;

      let enemyIds: EnemyId[] | undefined;
      let eventId: EventId | undefined;

      switch (type) {
        case 'combat': {
          // Early floors: 1 enemy. Mid (3-5): 1-2 enemies. Late (9): 1-2 stronger picks.
          const count = floor >= 3 && rng.next() < 0.5 ? 2 : 1;
          enemyIds = Array.from({ length: count }, () => rng.pick(ACT1_NORMAL_ENEMIES));
          break;
        }
        case 'elite': {
          // Single elite (the elite definitions already encode "pair" / "alpha"
          // semantics in their move set — no need to double up)
          enemyIds = [rng.pick(ACT1_ELITE_ENEMIES)];
          break;
        }
        case 'boss': {
          enemyIds = [ACT1_BOSS_ENEMY];
          break;
        }
        case 'event': {
          eventId = nextEvent();
          break;
        }
        default:
          break;
      }

      nodes.push({
        id,
        type,
        act: 1,
        floor,
        connections: [], // wired in the pass below
        ...(enemyIds !== undefined && { enemyIds }),
        ...(eventId !== undefined && { eventId }),
        visited: false,
        available: floor === 0, // only the start node is available initially
      });
    }
  }

  // Wire connections: each floor-F node connects to all floor-(F+1) nodes
  // (act 1's fixed layout has no branching choices after floor selection;
  // parallel-floor nodes both connect forward so the player picks a path)
  for (const spec of ACT1_FLOORS) {
    const nextSpec = ACT1_FLOORS[spec.floor + 1];
    if (!nextSpec) continue;

    const currentNodes = nodes.filter((n) => n.floor === spec.floor);
    const nextNodes = nodes.filter((n) => n.floor === nextSpec.floor);

    for (const src of currentNodes) {
      for (const dst of nextNodes) {
        (src.connections as NodeId[]).push(dst.id);
      }
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Acts 2 & 3 — procedural generation (Slay-the-Spire style)
// ---------------------------------------------------------------------------

const FLOORS_PER_ACT_PROC = 15;
const PROC_COLS = 7;

const NODE_WEIGHTS: Array<{ type: NodeType; weight: number }> = [
  { type: 'combat', weight: 45 },
  { type: 'event',  weight: 22 },
  { type: 'rest',   weight: 12 },
  { type: 'shop',   weight:  8 },
  { type: 'elite',  weight:  8 },
  { type: 'growth', weight:  5 },
];

function weightedPick(weights: typeof NODE_WEIGHTS, rand: () => number): NodeType {
  const total = weights.reduce((s, w) => s + w.weight, 0);
  let r = rand() * total;
  for (const w of weights) {
    r -= w.weight;
    if (r <= 0) return w.type;
  }
  return weights[weights.length - 1]?.type ?? 'combat';
}

function buildProceduralNodes(act: 2 | 3, seed: number): MapNode[] {
  const rng = createSeededRng((seed ^ (act * 0xdeadbeef)) >>> 0);
  const nodes: MapNode[] = [];

  for (let floor = 0; floor < FLOORS_PER_ACT_PROC; floor++) {
    const isBoss = floor === FLOORS_PER_ACT_PROC - 1;
    const colCount = isBoss ? 1 : rng.int(3, PROC_COLS);

    for (let col = 0; col < colCount; col++) {
      const id = `${act}-${floor}-${col}` as NodeId;
      const type: NodeType = isBoss
        ? 'boss'
        : floor === 0
          ? 'combat'
          : weightedPick(NODE_WEIGHTS, rng.next.bind(rng));

      nodes.push({
        id,
        type,
        act,
        floor,
        connections: [],
        visited: false,
        available: floor === 0,
      });
    }
  }

  // Ensure every next-floor node is reachable
  for (let floor = 0; floor < FLOORS_PER_ACT_PROC - 1; floor++) {
    const current = nodes.filter((n) => n.floor === floor);
    const next = nodes.filter((n) => n.floor === floor + 1);

    for (const n of next) {
      const src = rng.pick(current);
      if (!src.connections.includes(n.id)) {
        (src.connections as NodeId[]).push(n.id);
      }
    }

    for (const src of current) {
      if (rng.next() < 0.4 && next.length > 1) {
        const candidate = rng.pick(next.filter((n) => !src.connections.includes(n.id)));
        if (candidate) {
          (src.connections as NodeId[]).push(candidate.id);
        }
      }
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateActMap(act: 1 | 2 | 3, seed: number): ActMap {
  const nodes = act === 1
    ? buildAct1Nodes(seed)
    : buildProceduralNodes(act, seed);

  return {
    act,
    nodes,
    currentNodeId: null,
    seed,
  };
}

/**
 * After a node is visited, unlock its connections and close off sibling
 * alternatives on the same floor. Returns a new ActMap.
 */
export function advanceMap(map: ActMap, visitedNodeId: NodeId): ActMap {
  const visited = map.nodes.find((n) => n.id === visitedNodeId);
  if (!visited) return map;

  const updatedNodes = map.nodes.map((n) => {
    if (n.id === visitedNodeId) return { ...n, visited: true };
    if (visited.connections.includes(n.id)) return { ...n, available: true };
    if (n.floor === visited.floor && !n.visited) return { ...n, available: false };
    return n;
  });

  return { ...map, nodes: updatedNodes, currentNodeId: visitedNodeId };
}
