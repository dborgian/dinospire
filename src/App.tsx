import { useRunStore } from './stores/runStore';
import TitleScreen from './ui/meta/TitleScreen';
import MapScreen from './ui/map/MapScreen';
import CombatWrapper from './ui/shared/CombatWrapper';
import RewardScreen from './ui/reward/RewardScreen';
import EventScreen from './ui/map/EventScreen';
import RestScreen from './ui/map/RestScreen';
import GrowthScreen from './ui/map/GrowthScreen';
import GameOverScreen from './ui/map/GameOverScreen';

// MetaStore hydrates synchronously from localStorage via Zustand persist.
// TitleScreen subscribes to it directly; no loading gate needed at this level.
export default function App() {
  const run = useRunStore((s) => s.run);

  if (!run) return <TitleScreen />;

  switch (run.phase.t) {
    case 'title':
      return <TitleScreen />;
    case 'map':
      return <MapScreen />;
    case 'combat':
      return <CombatWrapper nodeId={run.phase.nodeId} />;
    case 'reward':
      return <RewardScreen pool={run.phase.pool} />;
    case 'event':
      return <EventScreen eventId={run.phase.eventId} step={run.phase.step} />;
    case 'shop':
      // ShopScreen not yet implemented
      return <MapScreen />;
    case 'rest':
      return <RestScreen />;
    case 'growth':
      return <GrowthScreen />;
    case 'gameOver':
      return <GameOverScreen reason={run.phase.reason} />;
    default:
      return <TitleScreen />;
  }
}
