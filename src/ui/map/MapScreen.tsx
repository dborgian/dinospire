import { motion } from 'framer-motion';
import { useRunStore } from '../../stores/runStore';
import type { MapNode, NodeId, NodeType, EvolutionStage } from '../../game/types';

// ---- Constants ----
const SVG_WIDTH = 320;
const FLOOR_HEIGHT = 120;
const NODE_RADIUS = 24;      // normal nodes
const BOSS_RADIUS = 30;      // boss / elite nodes
const H_PADDING = 40;        // left/right margin for node columns

// ---- Node icon map ----
const NODE_ICONS: Record<NodeType, string> = {
  combat:  '⚔',
  elite:   '💀',
  event:   '❓',
  rest:    '🔥',
  boss:    '👑',
  growth:  '🌿',
  shop:    '🛒',
};

// ---- Stage badge ----
const STAGE_LABELS: Record<EvolutionStage, string> = {
  cucciolo: 'CUCCIOLO',
  adulto:   'ADULTO',
  prime:    'PRIME',
};

// ---- Position helpers ----
function nodeX(col: number, colCount: number): number {
  if (colCount === 1) return SVG_WIDTH / 2;
  const usable = SVG_WIDTH - H_PADDING * 2;
  const step = usable / (colCount - 1);
  return H_PADDING + col * step;
}

function nodeY(floor: number, totalFloors: number): number {
  // Floor 0 starts at the bottom, boss at the top (SVG y=0 is top)
  // We invert so the start is near the bottom of the scroll
  const totalHeight = totalFloors * FLOOR_HEIGHT;
  return totalHeight - (floor + 1) * FLOOR_HEIGHT + FLOOR_HEIGHT / 2;
}

// ---- Single map node ----
interface MapNodeViewProps {
  node: MapNode;
  cx: number;
  cy: number;
  isCurrent: boolean;
  onSelect: (id: NodeId) => void;
}

function MapNodeView({ node, cx, cy, isCurrent, onSelect }: MapNodeViewProps) {
  const isBossOrElite = node.type === 'boss' || node.type === 'elite';
  const r = isBossOrElite ? BOSS_RADIUS : NODE_RADIUS;
  const isClickable = node.available && !node.visited;

  // Visual state colours
  let circleFill: string;
  let circleOpacity = 1;
  if (isCurrent) {
    circleFill = '#d97706'; // amber-600
  } else if (node.visited) {
    circleFill = '#44403c'; // stone-700
  } else if (node.available) {
    circleFill = '#d6d3d1'; // stone-300
  } else {
    circleFill = '#1c1917'; // stone-900
    circleOpacity = 0.4;
  }

  const textColour = (node.available && !node.visited) || isCurrent ? '#1c1917' : '#78716c';

  return (
    <g
      role={isClickable ? 'button' : undefined}
      aria-label={isClickable ? `Nodo ${NODE_ICONS[node.type]} floor ${node.floor}` : undefined}
      tabIndex={isClickable ? 0 : undefined}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
      onClick={() => isClickable && onSelect(node.id)}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(node.id);
        }
      }}
    >
      {/* Pulsing ring for current node */}
      {isCurrent && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={r + 8}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
          animate={{ opacity: [0.6, 0.1, 0.6], r: [r + 6, r + 14, r + 6] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={circleFill}
        opacity={circleOpacity}
        stroke={node.available && !node.visited ? '#a8a29e' : 'none'}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isBossOrElite ? 18 : 16}
        fill={textColour}
        aria-hidden="true"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {NODE_ICONS[node.type]}
      </text>
    </g>
  );
}

// ---- Connection lines ----
interface ConnectionLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  available: boolean;
}

function ConnectionLine({ x1, y1, x2, y2, available }: ConnectionLineProps) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={available ? '#78716c' : '#44403c'}
      strokeWidth={1.5}
      {...(!available ? { strokeDasharray: '4 4' } : {})}
      aria-hidden="true"
    />
  );
}

// ---- Main MapScreen ----
export default function MapScreen() {
  const run = useRunStore((s) => s.run);
  const dispatch = useRunStore((s) => s.dispatch);
  const clearRun = useRunStore((s) => s.clearRun);

  if (!run) return null;

  const { map, hp, maxHp, gold, evolutionStage } = run;
  const nodes = map.nodes;

  const floors = nodes.reduce((max, n) => Math.max(max, n.floor), 0) + 1;
  const svgHeight = floors * FLOOR_HEIGHT;

  // Group nodes by floor to compute column positions
  const byFloor = new Map<number, MapNode[]>();
  for (const node of nodes) {
    const group = byFloor.get(node.floor) ?? [];
    group.push(node);
    byFloor.set(node.floor, group);
  }

  // Build position lookup: nodeId → {cx, cy}
  const pos = new Map<NodeId, { cx: number; cy: number }>();
  for (const [floor, floorNodes] of byFloor) {
    floorNodes.forEach((node, col) => {
      pos.set(node.id, {
        cx: nodeX(col, floorNodes.length),
        cy: nodeY(floor, floors),
      });
    });
  }

  function handleSelect(nodeId: NodeId) {
    dispatch({ type: 'SELECT_NODE', nodeId });
  }

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col" role="main">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-stone-950/95 backdrop-blur border-b border-stone-800 px-4 py-3">
        <div className="max-w-sm mx-auto flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-amber-400 font-bold text-sm uppercase tracking-wide">
              Atto 1 — La Giungla Cretacea
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-red-400" aria-label={`HP: ${hp} su ${maxHp}`}>
              ❤ {hp}/{maxHp}
            </span>
            <span className="text-yellow-400" aria-label={`Oro: ${gold}`}>
              💰 {gold}
            </span>
            <span
              className="text-xs bg-stone-800 text-amber-300 px-2 py-0.5 rounded-full uppercase tracking-widest"
              aria-label={`Stage evoluzione: ${STAGE_LABELS[evolutionStage]}`}
            >
              {STAGE_LABELS[evolutionStage]}
            </span>
            <button
              onClick={() => {
                if (confirm('Abbandonare la run in corso?')) clearRun();
              }}
              className="text-xs text-stone-500 hover:text-red-400 transition-colors px-1"
              aria-label="Abbandona run e torna al menù"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      {/* Map scroll area */}
      <div
        className="flex-1 overflow-y-auto flex justify-center py-6"
        role="region"
        aria-label="Mappa dell'atto"
      >
        <svg
          width={SVG_WIDTH}
          height={svgHeight}
          aria-label="Mappa nodi"
        >
          {/* Connection lines — drawn first so nodes appear on top */}
          {nodes.map((src) => {
            const srcPos = pos.get(src.id);
            if (!srcPos) return null;
            return src.connections.map((dstId) => {
              const dstPos = pos.get(dstId);
              if (!dstPos) return null;
              const dst = nodes.find((n) => n.id === dstId);
              return (
                <ConnectionLine
                  key={`${src.id}-${dstId}`}
                  x1={srcPos.cx}
                  y1={srcPos.cy}
                  x2={dstPos.cx}
                  y2={dstPos.cy}
                  available={dst?.available ?? false}
                />
              );
            });
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const p = pos.get(node.id);
            if (!p) return null;
            return (
              <MapNodeView
                key={node.id}
                node={node}
                cx={p.cx}
                cy={p.cy}
                isCurrent={map.currentNodeId === node.id}
                onSelect={handleSelect}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
