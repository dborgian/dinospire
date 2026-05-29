// ========== ID branded types ==========

export type CardId = string & { __brand: 'CardId' };
export type CardInstanceId = string & { __brand: 'CardInstanceId' };
export type HeroId = string & { __brand: 'HeroId' };
export type EnemyId = string & { __brand: 'EnemyId' };
export type RelicId = string & { __brand: 'RelicId' };
export type NodeId = string & { __brand: 'NodeId' };
export type RunId = string & { __brand: 'RunId' };
export type EventId = string & { __brand: 'EventId' };

// ========== Content types (data-driven, from JSON) ==========

export type CardType = 'attack' | 'skill' | 'power';
export type CardRarity = 'starter' | 'common' | 'uncommon' | 'rare';
export type CardAct = 1 | 2 | 3;

export type TargetSpec = 'self' | 'enemy' | 'all_enemies' | 'random_enemy';

// Mini-DSL for dynamic effect values — lets JSON data express "damage = strength * 2"
// without baking numbers into the engine
export type DynExpr =
  | { op: 'val'; v: number }
  | { op: 'stat'; stat: 'strength' | 'dexterity' | 'vigor' | 'turn' }
  | { op: 'mul'; a: DynExpr; b: DynExpr }
  | { op: 'add'; a: DynExpr; b: DynExpr }
  | { op: 'div'; a: DynExpr; b: DynExpr }
  | { op: 'min'; a: DynExpr; b: DynExpr }
  | { op: 'max'; a: DynExpr; b: DynExpr };

export type Predicate =
  | { op: 'hasStatus'; target: TargetSpec; status: StatusKey }
  | { op: 'gte'; a: DynExpr; b: DynExpr }
  | { op: 'lte'; a: DynExpr; b: DynExpr }
  | { op: 'and'; conditions: Predicate[] }
  | { op: 'or'; conditions: Predicate[] }
  | { op: 'not'; condition: Predicate }
  | { op: 'tagInDeck'; tag: CardTag }
  | { op: 'cardsPlayedThisTurn'; gte: number };

export type CardTag =
  | 'carnivoro' | 'erbivoro'
  | 'theropode' | 'dromeosauride' | 'sauropode' | 'ankylosauro'
  | 'ceratopside' | 'stegosauro' | 'spinosauride'
  | 'triassico' | 'giurassico' | 'cretaceo'
  | 'branco' | 'compagno' | 'furtivo' | 'predatore' | 'mandria';

export type StatusKey =
  | 'strength' | 'dexterity' | 'vigor'
  | 'poison' | 'burn' | 'bleed'
  | 'vulnerable' | 'weak' | 'frail'
  | 'dodge' | 'thorns'
  | 'hex_rotten_egg';

export type CardEffect =
  | { kind: 'damage'; amount: number | DynExpr; target: TargetSpec }
  | { kind: 'block'; amount: number | DynExpr }
  | { kind: 'applyStatus'; status: StatusKey; stacks: number | DynExpr; target: TargetSpec }
  | { kind: 'draw'; n: number }
  | { kind: 'gainEnergy'; n: number }
  | { kind: 'addCardToDeck'; cardId: CardId; count?: number; temporary?: boolean }
  | { kind: 'exhaust'; target: 'self' | 'hand' | 'random_hand' }
  | { kind: 'heal'; amount: number | DynExpr }
  | { kind: 'conditional'; if: Predicate; then: CardEffect[]; else?: CardEffect[] }
  | { kind: 'synergy'; minCards: number; tags: CardTag[]; bonus: CardEffect[] }
  | { kind: 'repeat'; times: number | DynExpr; effect: CardEffect };

export type TriggerKey =
  | 'on_battle_start' | 'on_turn_start' | 'on_turn_end'
  | 'on_attack' | 'on_block' | 'on_card_played'
  | 'on_death' | 'on_kill' | 'on_shuffle';

export type SynergyKey =
  | 'branco_dromeosauride' | 'mandria_sauropoda' | 'carnivoro_alpha'
  | 'fortezza_anky' | 'veleno_spino' | 'triassico_antico';

export type Card = {
  id: CardId;
  name: { it: string };
  hero?: HeroId;
  cost: number | 'X';
  type: CardType;
  rarity: CardRarity;
  act: CardAct;
  tags: CardTag[];
  effects: CardEffect[];
  upgraded?: { cost?: number; effects: CardEffect[] };
  art?: { dinoSlug?: string; phylopicUuid?: string };
  flavorIt?: string;
};

export type CardInstance = {
  iid: CardInstanceId;
  cardId: CardId;
  upgraded: boolean;
  temporary: boolean;
  costOverride?: number;
};

// ========== Hero ==========

export type EvolutionStage = 'cucciolo' | 'adulto' | 'prime';

export type HeroDefinition = {
  id: HeroId;
  name: { it: string };
  taxonGroup: string;
  diet: 'carnivoro' | 'erbivoro';
  era: 'triassico' | 'giurassico' | 'cretaceo';
  art?: { phylopicUuid?: string; imageUrl?: string };
  stages: Record<EvolutionStage, {
    hp: number;
    energyPerTurn: number;
    handSize: number;
    passiveDescription: string;
    abilityKeys: string[];
  }>;
  starterDeck: CardId[];
  starterRelic: RelicId;
  primeConditions: string[];
};

// ========== Enemies ==========

export type IntentType = 'attack' | 'defend' | 'buff' | 'debuff' | 'unknown';

export type EnemyIntent = {
  type: IntentType;
  value?: number;
  description: string;
  hidden?: boolean;
};

export type EnemyMoveDefinition = {
  id: string;
  intent: EnemyIntent;
  effects: CardEffect[];
  probability?: number;
  conditioned?: Predicate;
};

export type EnemyDefinition = {
  id: EnemyId;
  name: { it: string };
  taxonGroup: string;
  diet: 'carnivoro' | 'erbivoro';
  hp: number;
  hpVariance?: number;
  tier: 'normal' | 'elite' | 'boss';
  art?: { phylopicUuid?: string };
  moves: EnemyMoveDefinition[];
  movePattern: 'sequential' | 'random' | 'conditional';
  initialStatuses?: Array<{ status: StatusKey; stacks: number }>;
};

// ========== Relics ==========

export type RelicTrigger = TriggerKey | 'on_relic_equip' | 'on_run_start' | 'on_act_start';

export type RelicDefinition = {
  id: RelicId;
  name: { it: string };
  description: string;
  tier: 'starter' | 'common' | 'uncommon' | 'rare' | 'boss' | 'ancestral';
  trigger: RelicTrigger;
  effects: CardEffect[];
  counterMax?: number;
  art?: { icon: string };
};

// ========== Run / Map ==========

export type NodeType = 'combat' | 'elite' | 'event' | 'rest' | 'shop' | 'boss' | 'growth';

export type MapNode = {
  id: NodeId;
  type: NodeType;
  act: 1 | 2 | 3;
  floor: number;
  connections: NodeId[];
  enemyIds?: EnemyId[];
  eventId?: EventId;
  visited: boolean;
  available: boolean;
};

export type ActMap = {
  act: 1 | 2 | 3;
  nodes: MapNode[];
  currentNodeId: NodeId | null;
  seed: number;
};

export type RunPhase =
  | { t: 'title' }
  | { t: 'map' }
  | { t: 'combat'; nodeId: NodeId }
  | { t: 'reward'; pool: Reward[] }
  | { t: 'event'; eventId: EventId; step: number }
  | { t: 'shop' }
  | { t: 'rest' }
  | { t: 'growth' }
  | { t: 'gameOver'; reason: 'death' | 'victory' };

export type Reward =
  | { kind: 'card'; cardId: CardId }
  | { kind: 'relic'; relicId: RelicId }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number };

export type RunState = {
  id: RunId;
  seed: number;
  act: 1 | 2 | 3;
  ascensionLevel: number;
  heroId: HeroId;
  evolutionStage: EvolutionStage;
  evolutionConditions: Record<string, number>;
  deck: CardInstance[];
  relics: RelicId[];
  relicCounters: Record<RelicId, number>;
  hp: number;
  maxHp: number;
  gold: number;
  map: ActMap;
  phase: RunPhase;
  stats: RunStats;
};

export type RunStats = {
  damageDealt: number;
  damageTaken: number;
  blockTotal: number;
  cardsPlayed: number;
  combatsWon: number;
  elitesDefeated: number;
  goldEarned: number;
};

// ========== Combat ==========

export type StatusMap = Partial<Record<StatusKey, number>>;

export type EnemyInstance = {
  iid: EnemyId;
  definitionId: EnemyId;
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusMap;
  currentMoveIndex: number;
  nextIntent: EnemyIntent;
};

export type CombatPhase = 'player_turn' | 'enemy_intent' | 'enemy_act' | 'victory' | 'defeat';

export type CombatEvent = {
  turn: number;
  phase: CombatPhase;
  kind: string;
  payload: Record<string, unknown>;
};

export type CombatState = {
  runId: RunId;
  nodeId: NodeId;
  seed: number;
  turn: number;
  phase: CombatPhase;
  cardsPlayedThisTurn: number;
  hero: {
    hp: number;
    maxHp: number;
    block: number;
    energy: number;
    energyMax: number;
    statuses: StatusMap;
    relicCounters: Record<RelicId, number>;
  };
  enemies: EnemyInstance[];
  piles: {
    draw: CardInstanceId[];
    hand: CardInstanceId[];
    discard: CardInstanceId[];
    exhaust: CardInstanceId[];
  };
  cardInstances: Record<CardInstanceId, CardInstance>;
  log: CombatEvent[];
};

export type CombatAction =
  | { type: 'START'; nodeId: NodeId; enemies: EnemyInstance[]; deck: CardInstance[] }
  | { type: 'PLAY_CARD'; cardIid: CardInstanceId; targetId?: EnemyId }
  | { type: 'END_TURN' }
  | { type: 'TRIGGER'; trigger: TriggerKey; ctx: Record<string, unknown> };

// ========== Meta / Progression ==========

export type MetaProfile = {
  version: 1;
  totalRuns: number;
  victories: number;
  unlockedHeroes: HeroId[];
  unlockedCards: CardId[];
  unlockedRelics: RelicId[];
  ascensionLevel: number;
};

// ========== Events ==========

export type EventChoice = {
  label: string;
  description: string;
  condition?: Predicate;
  outcomes: Array<{
    description: string;
    effects: CardEffect[];
    probability?: number;
  }>;
};

export type EventDefinition = {
  id: EventId;
  title: string;
  description: string;
  art?: string;
  choices: EventChoice[];
};

// ========== Ascension ==========

export type AscensionPatch = {
  level: number;
  description: string;
  patches: Array<
    | { path: 'enemy_hp_mul'; value: number }
    | { path: 'hero_start_hp_add'; value: number }
    | { path: 'shop_price_mul'; value: number }
    | { path: 'card_reward_count'; value: number }
    | { path: 'elite_frequency_add'; value: number }
  >;
};
