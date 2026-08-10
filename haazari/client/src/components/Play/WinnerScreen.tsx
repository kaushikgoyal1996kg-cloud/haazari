import { useGame } from '../../lib/GameStore';
import { PeacockMotif } from '../PeacockMotif';
import { AvatarBadge } from '../Lobby/AvatarPicker';
import './Play.css';

export function WinnerScreen() {
  const { room, winnerInfo, leaveSession } = useGame();
  if (!room || !winnerInfo) return null;

  const winner = room.players.find((p) => p.playerId === winnerInfo.winnerId);
  const sorted = [...room.players].sort(
    (a, b) => (winnerInfo.finalScores[b.playerId] ?? 0) - (winnerInfo.finalScores[a.playerId] ?? 0)
  );

  return (
    <div className="reveal-overlay">
      <div className="reveal-panel panel" style={{ maxWidth: 380 }}>
        <PeacockMotif size={56} />
        <div className="wordmark" style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Haazari Winner
        </div>
        {winner && <AvatarBadge avatar={winner.avatar} size="lg" />}
        <h1 style={{ fontSize: '1.8rem', color: 'var(--gold-300)' }}>{winner?.name ?? 'Winner'}</h1>
        <div className="reveal-points" style={{ fontSize: '1.4rem' }}>
          {winnerInfo.finalScores[winnerInfo.winnerId]} points
        </div>

        <hr className="gold-rule" />
        <div className="reveal-hands">
          {sorted.map((p, i) => (
            <div key={p.playerId} className="reveal-hand">
              <span className="reveal-hand__name">
                {i + 1}. <AvatarBadge avatar={p.avatar} size="sm" /> {p.name}
              </span>
              <span>{winnerInfo.finalScores[p.playerId] ?? 0}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-primary" onClick={leaveSession}>
          Return to Lobby
        </button>
      </div>
    </div>
  );
}
