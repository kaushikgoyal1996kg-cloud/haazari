import { useEffect, useState } from 'react';

// The browser fires this event (Chrome/Edge/most Android browsers) when the
// site qualifies for installation (has a valid manifest + icons, which we
// already ship). Capturing it lets us show our OWN "Install App" button
// instead of the user having to find it in the browser's menu themselves.
// Safari (iOS) never fires this event - there's no programmatic install
// prompt there, only the manual Share -> Add to Home Screen flow, so this
// hook reports `supported: false` on iOS and the UI should show manual
// instructions instead.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneAlready(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true // iOS Safari's own flag
  );
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneAlready());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome;
  }

  return {
    /** True once the browser has told us installation is available right now. */
    canPromptInstall: !!deferredPrompt,
    /** True if already installed/running standalone - hide any install UI. */
    installed,
    /** iOS never supports the programmatic prompt - show manual instructions instead. */
    isIos: isIos(),
    promptInstall,
  };
}
