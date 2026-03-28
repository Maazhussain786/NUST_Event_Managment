'use client';

export const AUTH_STATE_CHANGED_EVENT = 'auth-state-changed';

interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  userType: string;
  avatarUrl?: string | null;
}

function emitAuthStateChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_STATE_CHANGED_EVENT));
  }
}

export function setLocalUser(user: SessionUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user', JSON.stringify(user));
  emitAuthStateChanged();
}

export function getLocalUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function clearLocalAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  emitAuthStateChanged();
}

export async function syncUserFromSession(): Promise<SessionUser | null> {
  if (typeof window === 'undefined') return null;

  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      clearLocalAuth();
      return null;
    }

    const data = await res.json();
    if (data?.user) {
      setLocalUser(data.user as SessionUser);
      return data.user as SessionUser;
    }
  } catch {
    // network errors should not wipe valid local UI state aggressively
  }

  return getLocalUser();
}

export async function logoutClient(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    clearLocalAuth();
  }
}

