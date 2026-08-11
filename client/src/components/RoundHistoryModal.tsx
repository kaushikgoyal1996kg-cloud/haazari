import { useGame } from '../lib/GameStore';
import './RulesModal.css';
import './StatsModal.css';

interface Props {
  onClose: () => void;
}

export function RoundHistoryModal({ onClose }: Props) {
  const { room, roundHistory } = useGame();
  if (!room) return null;

  const nameOf = (pid: string) => room.players.find((p) => p.playerId === pid)?.name ?? pid;

  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel__header">
          <h2>Round History</h2>
          <button className="rules-close btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {roundHistory.length === 0 ? (
          <p className="text-muted stats-modal__empty">
            <span className="empty-state__icon" aria-hidden="true">📜</span>
            <br />
            No rounds completed yet this game.
          </p>
        ) : (
          <div className="round-history-list">
            {[...roundHistory].reverse().map((r, i) => (
              <div key={roundHistory.length - i} className="round-history-row">
                <div className="round-history-row__header">
                  <span>
                    Round {r.roundNumber} {r.dismissed && <span className="round-history-row__dismissed">(dismissed)</span>}
                  </span>
                  <span className="text-muted">Dealer: {nameOf(r.dealerId)}</span>
                </div>
                <div className="round-history-row__scores">
                  {room.players.map((p) => (
                    <div key={p.playerId} className="round-history-row__player">
                      <span>{p.name}</span>
                      <span>
                        {r.dismissed ? '0' : `+${r.pointsThisRound[p.playerId] ?? 0}`}
                        <span className="text-muted"> ({r.cumulativeScores[p.playerId] ?? 0})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
