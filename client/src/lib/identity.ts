const IDENTITY_KEY = 'haazari_identity_v1';

export interface SavedIdentity {
  name: string;
  avatar: string;
}

export function getSavedIdentity(): SavedIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === 'string' && typeof parsed?.avatar === 'string' && parsed.name.trim()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveIdentity(name: string, avatar: string): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name, avatar }));
  } catch {
    /* ignore storage failures */
  }
}
