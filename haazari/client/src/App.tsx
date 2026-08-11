import { useEffect, useRef, useState } from 'react';
import { useGame } from './lib/GameStore';
import { Landing } from './components/Lobby/Landing';
import { RoomLobby } from './components/Lobby/RoomLobby';
import { ArrangementScreen } from './components/Arrangement/ArrangementScreen';
import { PlayTable } from './components/Play/PlayTable';
import { RoundSummary } from './components/Play/RoundSummary';
import { WinnerScreen } from './components/Play/WinnerScreen';
import { RulesModal } from './components/RulesModal';
import { SettingsModal } from './components/SettingsModal';
import { StatsModal } from './components/StatsModal';
import { RoundHistoryModal } from './components/RoundHistoryModal';
import { LoadingSpinner } from './components/LoadingSpinner';
import { TutorialModal } from './components/TutorialModal';
import { ChatPanel } from './components/ChatPanel';
import { hasSeenTutorial } from './lib/tutorial';
import './App.css';

const ARRANGING_STATES = new Set(['ARRANGING_HANDS', 'WAITING_FOR_HAND_CONFIRMATION', 'ROUND_READY']);
const PLAYING_STATES = new Set([
  'PLAYING_SET_1',
  'REVEALING_SET_1',
  'PLAYING_SET_2',
  'REVEALING_SET_2',
  'PLAYING_SET_3',
  'REVEALING_SET_3',
  'PLAYING_SET_4',
  'REVEALING_SET_4',
]);

function HomeScreenReturn() {
  const { room, gameState, returnToGame, leaveSession, leaveTable } = useGame();
  const inActiveGame = room?.status === 'IN_GAME' && gameState && !['GAME_COMPLETE'].includes(gameState.state);

  return (
    <div className="landing">
      <h1 className="wordmark landing__title">Haazari</h1>
      <div className="landing__form panel">
        {room ? (
          <>
            <p>
              You have an active {room.status === 'LOBBY' ? 'room' : 'game'} — <strong>{room.roomCode}</strong>.
            </p>
            <button className="btn btn-primary" onClick={returnToGame}>
              {room.status === 'LOBBY' ? 'Return to Room' : 'Rejoin Game'}
            </button>
            {inActiveGame && (
              <button className="btn btn-ghost" onClick={leaveTable}>
                Leave Table Instead
              </button>
            )}
            <button className="btn btn-ghost" onClick={leaveSession}>
              Leave &amp; Go to Landing
            </button>
          </>
        ) : (
          <p className="text-muted">No active game.</p>
        )}
      </div>
    </div>
  );
}

export function App() {
  const {
    connectionStatus,
    hasConnectedOnce,
    room,
    gameState,
    myPlayerId,
    myHand,
    myArrangedSets,
    gameError,
    clearGameError,
    confirmArrangement,
    requestDismissal,
    viewMode,
    leaveTable,
  } = useGame();
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showRoundHistory, setShowRoundHistory] = useState(false);
  const [showConnBanner, setShowConnBanner] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial());

  // Delay showing the connection banner briefly so a normal fast connection
  // never flashes it - only show once a wait is actually noticeable.
  useEffect(() => {
    if (connectionStatus === 'connected') {
      setShowConnBanner(false);
      return;
    }
    const t = setTimeout(() => setShowConnBanner(true), 1200);
    return () => clearTimeout(t);
  }, [connectionStatus]);

  // The server transitions straight from "playing Set 4" to
  // ROUND_COMPLETE (or straight to GAME_COMPLETE, if that round won the
  // game) in a single tick - there's no separate "revealing Set 4"
  // broadcast the way there is between Sets 1-3 (where the state stays
  // PLAYING_SET_X, keeping PlayTable mounted so its reveal overlay can
  // show). Without this hold, the screen would swap straight to
  // RoundSummary/WinnerScreen the instant Set 4 resolves, and players
  // would never see the 4th set's cards or who won it. Keep rendering
  // PlayTable for a brief grace period after that transition so its
  // existing reveal-overlay logic (driven by subRoundResultsThisRound,
  // which already contains Set 4's result regardless of top-level state)
  // gets a chance to actually show and auto-dismiss, matching the same
  // ~3.2s timing PlayTable itself uses for Sets 1-3.
  const [holdingFinalReveal, setHoldingFinalReveal] = useState(false);
  const prevGameStateRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevGameStateRef.current;
    const curr = gameState?.state;
    const justFinished =
      prev && PLAYING_STATES.has(prev) && (curr === 'ROUND_COMPLETE' || curr === 'DISMISSED_ROUND' || curr === 'GAME_COMPLETE');
    prevGameStateRef.current = curr;
    if (!justFinished) return;
    setHoldingFinalReveal(true);
    const t = setTimeout(() => setHoldingFinalReveal(false), 3600);
    return () => clearTimeout(t);
  }, [gameState?.state]);

  let screen: React.ReactNode;
  let screenKey: string;

  if (room && viewMode === 'home') {
    screen = <HomeScreenReturn />;
    screenKey = 'home-return';
  } else if (!room) {
    screen = <Landing />;
    screenKey = 'landing';
  } else if (room.status === 'LOBBY') {
    screen = <RoomLobby />;
    screenKey = 'lobby';
  } else if (gameState?.state === 'GAME_COMPLETE' && !holdingFinalReveal) {
    screen = <WinnerScreen />;
    screenKey = 'winner';
  } else if (
    (gameState?.state === 'ROUND_COMPLETE' || gameState?.state === 'DISMISSED_ROUND') &&
    !holdingFinalReveal
  ) {
    screen = <RoundSummary />;
    screenKey = 'round-summary';
  } else if (
    gameState &&
    (PLAYING_STATES.has(gameState.state) ||
      (holdingFinalReveal && (gameState.state === 'ROUND_COMPLETE' || gameState.state === 'DISMISSED_ROUND' || gameState.state === 'GAME_COMPLETE')))
  ) {
    screen = <PlayTable />;
    screenKey = 'playing';
  } else if (gameState && ARRANGING_STATES.has(gameState.state)) {
    screen = myArrangedSets ? (
      <div className="waiting-screen">
        <LoadingSpinner message="Waiting for the other players to arrange their hands…" />
      </div>
    ) : myHand.length === 13 ? (
      <ArrangementScreen
        hand={myHand}
        onConfirm={confirmArrangement}
        onDismiss={requestDismissal}
        submitError={gameError}
        cumulativeScore={myPlayerId ? gameState?.cumulativeScores[myPlayerId] : undefined}
      />
    ) : (
      <div className="waiting-screen">
        <LoadingSpinner message="Dealing the cards…" />
      </div>
    );
    screenKey = myArrangedSets ? 'arranging-waiting' : myHand.length === 13 ? 'arranging' : 'dealing';
  } else {
    screen = (
      <div className="waiting-screen">
        <LoadingSpinner message="Loading…" />
      </div>
    );
    screenKey = 'loading';
  }

  const inGameForSettings = !!(
    room &&
    viewMode === 'active' &&
    gameState &&
    (ARRANGING_STATES.has(gameState.state) || PLAYING_STATES.has(gameState.state))
  );

  return (
    <div className="app-root">
      {showConnBanner && connectionStatus !== 'connected' && (
        <div className="conn-banner">
          {hasConnectedOnce
            ? 'Reconnecting…'
            : 'Waking up the table… this can take up to a minute the first time'}
        </div>
      )}
      {room && viewMode === 'active' && (
        <button className="settings-fab fab" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙️
        </button>
      )}
      {room && viewMode === 'active' && <ChatPanel />}
      <div key={screenKey} className="screen-fade">
        {screen}
      </div>
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showRoundHistory && <RoundHistoryModal onClose={() => setShowRoundHistory(false)} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenRules={() => setShowRules(true)}
          onOpenStats={() => setShowStats(true)}
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenRoundHistory={() => setShowRoundHistory(true)}
          onLeaveTable={inGameForSettings ? leaveTable : undefined}
        />
      )}
      {gameError && !ARRANGING_STATES.has(gameState?.state ?? '') && !PLAYING_STATES.has(gameState?.state ?? '') && (
        <div className="toast toast--error" onClick={clearGameError}>
          {gameError}
        </div>
      )}
    </div>
  );
}
