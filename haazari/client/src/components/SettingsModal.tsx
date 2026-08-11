import { useGame } from '../lib/GameStore';
import { isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { useState } from 'react';
import './RulesModal.css';

interface Props {
  onClose: () => void;
  onOpenRules: () => void;
  onOpenStats: () => void;
  onLeaveTable?: () => void;
}

export function SettingsModal({ onClose, onOpenRules, onOpenStats, onLeaveTable }: Props) {
  const { goToHomeScreen, room } = useGame();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const { canPromptInstall, installed, isIos, promptInstall } = useInstallPrompt();

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }

  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="rules-panel panel" onClick={(e) => e.stopPropagation()}>
        <div className="rules-panel__header">
          <h2>Settings</h2>
          <button className="rules-close btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="settings-list">
          {!installed && (canPromptInstall || isIos) && (
            <button
              className="settings-row"
              onClick={async () => {
                if (isIos) {
                  alert('On iPhone/iPad: tap the Share button (□↑) in Safari, then "Add to Home Screen."');
                  return;
                }
                await promptInstall();
              }}
            >
              <span>📲 Install App (add icon to phone)</span>
              <span className="text-muted">›</span>
            </button>
          )}

          <button className="settings-row" onClick={toggleSound}>
            <span>Sound</span>
            <span className={`settings-toggle ${soundOn ? 'settings-toggle--on' : ''}`}>
              {soundOn ? 'On' : 'Off'}
            </span>
          </button>

          <button
            className="settings-row"
            onClick={() => {
              onClose();
              onOpenRules();
            }}
          >
            <span>Rules</span>
            <span className="text-muted">›</span>
          </button>

          <button
            className="settings-row"
            onClick={() => {
              onClose();
              onOpenStats();
            }}
          >
            <span>Your Stats</span>
            <span className="text-muted">›</span>
          </button>

          {room && (
            <button
              className="settings-row"
              onClick={() => {
                onClose();
                goToHomeScreen();
              }}
            >
              <span>Return to Landing Screen (stay connected)</span>
              <span className="text-muted">›</span>
            </button>
          )}

          {onLeaveTable && (
            <button
              className="settings-row settings-row--danger"
              onClick={() => {
                onClose();
                onLeaveTable();
              }}
            >
              <span>Leave Table</span>
              <span className="text-muted">›</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
