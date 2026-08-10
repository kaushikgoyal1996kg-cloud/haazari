import { useState } from 'react';
import { useGame } from './lib/GameStore';
import { Landing } from './components/Lobby/Landing';
import { RoomLobby } from './components/Lobby/RoomLobby';
import { ArrangementScreen } from './components/Arrangement/ArrangementScreen';
import { PlayTable } from './components/Play/PlayTable';
import { RoundSummary } from './components/Play/RoundSummary';
import { WinnerScreen } from './components/Play/WinnerScreen';
import { RulesModal } from './components/RulesModal';
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

export function App() {
  const { connectionStatus, room, gameState, myHand, myArrangedSets, gameError, clearGameError, confirmArrangement, requestDismissal } =
    useGame();
  const [showRules, setShowRules] = useState(false);

  let screen: React.ReactNode;

  if (!room) {
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
      <ArrangementScreen hand={myHand} onConfirm={confirmArrangement} onDismiss={requestDismissal} submitError={gameError} />
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

  return (
    <div className="app-root">
      {connectionStatus === 'disconnected' && (
        <div className="conn-banner">Reconnecting…</div>
      )}
      {room && (
        <button className="rules-fab btn btn-ghost" onClick={() => setShowRules(true)}>
          Rules
        </button>
      )}
      {screen}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {gameError && !ARRANGING_STATES.has(gameState?.state ?? '') && !PLAYING_STATES.has(gameState?.state ?? '') && (
        <div className="toast toast--error" onClick={clearGameError}>
          {gameError}
        </div>
      )}
    </div>
  );
}
