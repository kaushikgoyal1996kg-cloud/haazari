import { useGame } from '../lib/GameStore';
import './RulesModal.css';
import './StatsModal.css';

interface Props {
  onClose: () => void;
}

export function StatsModal({ onClose }: Props) {
  const { getStats } = useGame();
  const rows = getStats();

  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel__header">
          <h2>Your Stats</h2>
          <button className="rules-close btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <p className="text-muted stats-modal__note">
          Tracked on this device only, by the name you've played under.
        </p>

        {rows.length === 0 ? (
          <p className="text-muted stats-modal__empty">
            <span className="empty-state__icon" aria-hidden="true">🏆</span>
            <br />
            No games recorded yet — finish a game to see your stats here.
          </p>
        ) : (
          <div className="stats-table">
            <div className="stats-table__header">
              <span>Name</span>
              <span>Played</span>
              <span>Won</span>
              <span>Win %</span>
              <span>Avg pts</span>
            </div>
            {rows.map(({ name, stats }) => (
              <div key={name} className="stats-table__row">
                <span className="stats-table__name">{name}</span>
                <span>{stats.gamesPlayed}</span>
                <span>{stats.gamesWon}</span>
                <span>{stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%</span>
                <span>{stats.gamesPlayed > 0 ? Math.round(stats.totalPoints / stats.gamesPlayed) : 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
