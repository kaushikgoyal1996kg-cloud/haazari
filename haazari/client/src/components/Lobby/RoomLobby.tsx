import { useGame } from '../../lib/GameStore';
import { AvatarBadge } from './AvatarPicker';
import './Lobby.css';

export function RoomLobby() {
  const { room, myPlayerId, setReady, startGame, addBot, leaveSession } = useGame();
  if (!room) return null;

  const me = room.players.find((p) => p.playerId === myPlayerId);
  const isHost = me?.isHost ?? false;
  const openSeats = 4 - room.players.length;
  const allReady = room.players.length === 4 && room.players.every((p) => p.ready);

  return (
    <div className="room-lobby">
      <h1 className="wordmark room-lobby__title">Haazari Room</h1>

      <div className="room-lobby__code panel">
        <span className="text-muted">Room Code</span>
        <div className="room-lobby__code-value">{room.roomCode}</div>
        <span className="text-muted">Share this code with 3 friends</span>
      </div>

      <div className="room-lobby__players panel">
        {[0, 1, 2, 3].map((i) => {
          const p = room.players[i];
          return (
            <div key={i} className="room-lobby__player">
              {p ? (
                <>
                  <span className={p.ready ? 'room-lobby__dot room-lobby__dot--ready' : 'room-lobby__dot'} />
                  <AvatarBadge avatar={p.avatar} size="md" />
                  <span className="room-lobby__name">
                    {p.name} {p.isHost && <span className="room-lobby__host-tag">Host</span>}
                    {p.isBot && <span className="room-lobby__host-tag room-lobby__host-tag--bot">🤖 Bot</span>}
                    {p.playerId === myPlayerId && ' (you)'}
                  </span>
                  <span className="text-muted">
                    {p.isBot ? 'Ready' : !p.connected ? 'Disconnected' : p.ready ? 'Ready' : 'Waiting'}
                  </span>
                </>
              ) : (
                <span className="text-muted">Waiting for player...</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="room-lobby__actions">
        {me && (
          <button className="btn" onClick={() => setReady(!me.ready)}>
            {me.ready ? 'Not Ready' : "I'm Ready"}
          </button>
        )}
        {isHost && openSeats > 0 && (
          <button className="btn btn-ghost" onClick={addBot}>
            🤖 Add Computer Player {openSeats > 0 && `(${openSeats} open seat${openSeats > 1 ? 's' : ''})`}
          </button>
        )}
        {isHost && (
          <button className="btn btn-primary" disabled={!allReady} onClick={startGame}>
            Start Game
          </button>
        )}
        <button className="btn btn-ghost" onClick={leaveSession}>Leave</button>
      </div>
      {isHost && !allReady && <p className="text-muted room-lobby__hint">Waiting for all 4 players to be ready…</p>}
    </div>
  );
}
