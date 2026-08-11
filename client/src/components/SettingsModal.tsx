import { useGame } from '../lib/GameStore';
import { isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { useState } from 'react';
import './RulesModal.css';

interface Props {
  onClose: () => void;
  onOpenRules: () => void;
  onOpenStats: () => void;
  onOpenTutorial: () => void;
  onOpenRoundHistory: () => void;
  onLeaveTable?: () => void;
}

export function SettingsModal({ onClose, onOpenRules, onOpenStats, onOpenTutorial, onOpenRoundHistory, onLeaveTable }: Props) {
  const { goToHomeScreen, room } = useGame();
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const { canPromptInstall, installed, isIos, promptInstall } = useInstallPrompt();
  const [confirmingLeave, setConfirmingLeave] = useState(false);

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
          <button className="rules-close btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
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
              onOpenTutorial();
            }}
          >
            <span>How to Play (tutorial)</span>
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
                onOpenRoundHistory();
              }}
            >
              <span>Round History</span>
              <span className="text-muted">›</span>
            </button>
          )}

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

          {onLeaveTable && !confirmingLeave && (
            <button
              className="settings-row settings-row--danger"
              onClick={() => setConfirmingLeave(true)}
            >
              <span>Leave Table</span>
              <span className="text-muted">›</span>
            </button>
          )}

          {onLeaveTable && confirmingLeave && (
            <div className="settings-leave-confirm">
              <p>
                A computer player will take over your seat and the game will continue for everyone else. You won't
                be able to rejoin this game. Leave anyway?
              </p>
              <div className="settings-leave-confirm__actions">
                <button className="btn btn-ghost" onClick={() => setConfirmingLeave(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onLeaveTable();
                  }}
                >
                  Yes, Leave Table
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
