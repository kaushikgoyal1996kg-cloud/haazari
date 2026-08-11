import { useGame } from '../../lib/GameStore';
import { AvatarBadge } from '../Lobby/AvatarPicker';
import type { PlayerId } from '../../game/types';
import './Play.css';

const SIDE_LABELS = ['bottom', 'left', 'top', 'right'] as const;

export function ArrangingWaitScreen() {
  const { room, gameState, myPlayerId } = useGame();
  if (!room || !gameState || !myPlayerId) return null;

  const allIds = room.players.map((p) => p.playerId);
  const myIndex = allIds.indexOf(myPlayerId);
  const seatOrder: PlayerId[] =
    myIndex === -1 ? allIds : [0, 1, 2, 3].map((offset) => allIds[(myIndex + offset) % allIds.length]);

  const confirmed = new Set(gameState.playersConfirmedArrangement);
  const confirmedCount = confirmed.size;

  return (
    <div className="play-screen">
      <header className="play-header">
        <div className="play-header__meta">
          <span className="text-muted">Room {room.roomCode}</span>
          <span className="text-muted">Round {gameState.roundNumber}</span>
        </div>
        <div className="play-header__progress text-muted">{confirmedCount}/4 players ready</div>
      </header>

      <div className="table-felt">
        <div className="table-felt__base" aria-hidden="true" />
        <div className="table-felt__quilt" aria-hidden="true" />
        <div className="table-felt__vignette" aria-hidden="true" />
        <div className="table-felt__emblem" aria-hidden="true">
          ♠
        </div>
        {[0, 1, 2, 3].map((corner) => (
          <span key={corner} className={`table-felt__rivet table-felt__rivet--${corner}`} aria-hidden="true" />
        ))}
        {seatOrder.map((pid, i) => {
          const side = SIDE_LABELS[i];
          const isMe = pid === myPlayerId;
          const isDealer = pid === gameState.dealerId;
          const isReady = confirmed.has(pid);
          const info = room.players.find((p) => p.playerId === pid);
          return (
            <div key={pid} className={`seat seat--${side} ${isMe ? 'seat--me' : ''} ${isReady ? 'seat--turn' : ''}`}>
              <div className="seat__badge-row">
                {isDealer && <span className="seat__badge">Dealer</span>}
                {info?.isBot && <span className="seat__badge seat__badge--bot">🤖 Bot</span>}
                {info && !info.connected && !info.isBot && (
                  <span className="seat__badge seat__badge--warn">Away</span>
                )}
              </div>
              {info && <AvatarBadge avatar={info.avatar} size={isMe ? 'lg' : 'md'} ring />}
              <div className="seat__name">
                {info?.name ?? pid}
                {isMe && ' (you)'}
              </div>
              <div className="seat__status">
                {isReady ? <span className="seat__ready">✓ Ready</span> : <span className="text-muted">Arranging…</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel arranging-wait-panel">
        <h2>Hand confirmed</h2>
        <p className="text-muted">Waiting for the other players to arrange their hands…</p>
      </div>
    </div>
  );
}
