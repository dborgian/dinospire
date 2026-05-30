import { useEffect, useState } from 'react';
import { useRunStore } from './stores/runStore';
import TitleScreen from './ui/meta/TitleScreen';
import MapScreen from './ui/map/MapScreen';
import CombatWrapper from './ui/shared/CombatWrapper';
import RewardScreen from './ui/reward/RewardScreen';
import EventScreen from './ui/map/EventScreen';
import RestScreen from './ui/map/RestScreen';
import GrowthScreen from './ui/map/GrowthScreen';
import GameOverScreen from './ui/map/GameOverScreen';

// Each browser tab gets its own session flag so multiple players on the same
// device don't share the localStorage run state.
// The flag is set only after the player explicitly starts or resumes a run.
const TAB_SESSION_KEY = '__dinospire_tab_active__';

function hasTabSession(): boolean {
  try { return sessionStorage.getItem(TAB_SESSION_KEY) === '1'; } catch { return false; }
}

function setTabSession(): void {
  try { sessionStorage.setItem(TAB_SESSION_KEY, '1'); } catch { /* ignore */ }
}

export default function App() {
  const run = useRunStore((s) => s.run);
  // True only once the player has taken an action in this tab (start or resume).
  const [tabActive, setTabActive] = useState(hasTabSession);

  // If the player has already activated this tab (e.g. after page refresh),
  // keep the flag alive across re-renders.
  useEffect(() => {
    if (tabActive) setTabSession();
  }, [tabActive]);

  function activate() {
    setTabSession();
    setTabActive(true);
  }

  // New tab with an existing run in localStorage → show TitleScreen so the
  // player can choose to resume or start fresh.
  if (!tabActive || !run) {
    return <TitleScreen onActivate={activate} />;
  }

  switch (run.phase.t) {
    case 'title':
      return <TitleScreen onActivate={activate} />;
    case 'map':
      return <MapScreen />;
    case 'combat':
      return <CombatWrapper nodeId={run.phase.nodeId} />;
    case 'reward':
      return <RewardScreen pool={run.phase.pool} />;
    case 'event':
      return <EventScreen eventId={run.phase.eventId} step={run.phase.step} />;
    case 'shop':
      return <MapScreen />;
    case 'rest':
      return <RestScreen />;
    case 'growth':
      return <GrowthScreen />;
    case 'gameOver':
      return <GameOverScreen reason={run.phase.reason} />;
    default:
      return <TitleScreen onActivate={activate} />;
  }
}
