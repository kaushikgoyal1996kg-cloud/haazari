const TUTORIAL_SEEN_KEY = 'haazari_tutorial_seen_v1';

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true';
  } catch {
    return true; // if storage is unavailable, don't force the tutorial every load
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
  } catch {
    /* ignore storage failures */
  }
}
