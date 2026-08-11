import { useState } from 'react';
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
import { ChatPanel } from './components/ChatPanel';
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

  let screen: React.ReactNode;

  if (room && viewMode === 'home') {
    screen = <HomeScreenReturn />;
  } else if (!room) {
    screen = <Landing />;
  } else if (room.status === 'LOBBY') {
    screen = <RoomLobby />;
  } else if (gameState?.state === 'GAME_COMPLETE') {
    screen = <WinnerScreen />;
  } else if (gameState?.state === 'ROUND_COMPLETE' || gameState?.state === 'DISMISSED_ROUND') {
    screen = <RoundSummary />;
  } else if (gameState && ARRANGING_STATES.has(gameState.state)) {
    screen = myArrangedSets ? (
      <div className="waiting-screen">
        <h2>Hand confirmed</h2>
        <p className="text-muted">Waiting for the other players to arrange their hands…</p>
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
        <h2>Dealing…</h2>
      </div>
    );
  } else if (gameState && PLAYING_STATES.has(gameState.state)) {
    screen = <PlayTable />;
  } else {
    screen = (
      <div className="waiting-screen">
        <h2>Loading…</h2>
      </div>
    );
  }

  const inGameForSettings = !!(
    room &&
    viewMode === 'active' &&
    gameState &&
    (ARRANGING_STATES.has(gameState.state) || PLAYING_STATES.has(gameState.state))
  );

  return (
    <div className="app-root">
      {connectionStatus === 'disconnected' && (
        <div className="conn-banner">Reconnecting…</div>
      )}
      {room && viewMode === 'active' && (
        <button className="rules-fab btn btn-ghost" onClick={() => setShowRules(true)}>
          Rules
        </button>
      )}
      {room && viewMode === 'active' && (
        <button className="settings-fab btn btn-ghost" onClick={() => setShowSettings(true)} aria-label="Settings">
          ⚙️
        </button>
      )}
      {room && viewMode === 'active' && <ChatPanel />}
      {screen}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenRules={() => setShowRules(true)}
          onOpenStats={() => setShowStats(true)}
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
