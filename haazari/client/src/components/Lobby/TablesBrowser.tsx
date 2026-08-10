import { useEffect, useState } from 'react';
import { useGame } from '../../lib/GameStore';
import type { TableSummary } from '../../game/types';
import './Lobby.css';

interface Props {
  onJoin: (roomCode: string) => void;
  onBack: () => void;
  busy: boolean;
  error: string | null;
}

const REFRESH_MS = 3000;

export function TablesBrowser({ onJoin, onBack, busy, error }: Props) {
  const { listTables } = useGame();
  const [tables, setTables] = useState<TableSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const result = await listTables();
      if (!cancelled) setTables(result);
    }
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [listTables]);

  return (
    <div className="landing__form panel tables-browser">
      <div className="tables-browser__header">
        <span>Open Tables</span>
        <span className="text-muted tables-browser__count">
          {tables === null ? 'Loading…' : `${tables.length} open`}
        </span>
      </div>

      {tables === null && <div className="text-muted tables-browser__empty">Looking for tables…</div>}

      {tables !== null && tables.length === 0 && (
        <div className="text-muted tables-browser__empty">
          No open tables right now. Create one and friends can find it here too.
        </div>
      )}

      {tables !== null && tables.length > 0 && (
        <div className="tables-browser__list">
          {tables.map((t) => (
            <div key={t.roomCode} className="tables-browser__row">
              <div className="tables-browser__row-info">
                <span className="tables-browser__code">{t.roomCode}</span>
                <span className="text-muted">{t.hostName}'s table</span>
              </div>
              <div className="tables-browser__row-actions">
                <span className="text-muted">{t.playerCount}/{t.maxPlayers}</span>
                <button className="btn btn-primary" disabled={busy} onClick={() => onJoin(t.roomCode)}>
                  Join
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error-text">{error}</div>}

      <div className="landing__form-actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
