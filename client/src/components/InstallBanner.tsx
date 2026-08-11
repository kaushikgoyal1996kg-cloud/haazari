import { useState } from 'react';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import './InstallBanner.css';

export function InstallBanner() {
  const { canPromptInstall, installed, isIos, promptInstall } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (installed) return null;
  if (!canPromptInstall && !isIos) return null;

  async function handleClick() {
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    await promptInstall();
  }

  return (
    <div className="install-banner">
      <button className="btn install-banner__btn" onClick={handleClick}>
        📲 Install App to Home Screen
      </button>
      {showIosHelp && (
        <div className="install-banner__ios-help">
          <p>
            On iPhone/iPad: tap the <strong>Share</strong> button (□↑) in Safari's toolbar, then choose{' '}
            <strong>"Add to Home Screen."</strong>
          </p>
          <button className="btn btn-ghost" onClick={() => setShowIosHelp(false)}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
