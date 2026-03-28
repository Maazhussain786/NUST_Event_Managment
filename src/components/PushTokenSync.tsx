"use client";

import { useEffect } from "react";

interface PushTokenPayload {
  token: string;
  platform?: "ios" | "android" | "web" | "expo" | "unknown";
  deviceId?: string | null;
  appVersion?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

const STORAGE_KEY = "nust_push_token_payload";

async function postToken(payload: PushTokenPayload): Promise<void> {
  await fetch("/api/push/tokens", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function deleteToken(token: string): Promise<void> {
  await fetch("/api/push/tokens", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

function readStoredPayload(): PushTokenPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PushTokenPayload;
    if (!parsed?.token || typeof parsed.token !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPayload(payload: PushTokenPayload): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function removeStoredPayload(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

declare global {
  interface Window {
    NUSTEventsPush?: {
      registerToken: (payload: PushTokenPayload) => Promise<void>;
      unregisterToken: (token: string) => Promise<void>;
    };
  }
}

export function PushTokenSync() {
  useEffect(() => {
    let disposed = false;

    const registerToken = async (payload: PushTokenPayload) => {
      const token = typeof payload?.token === "string" ? payload.token.trim() : "";
      if (!token) return;

      const normalized: PushTokenPayload = {
        token,
        platform: payload.platform || "unknown",
        deviceId: payload.deviceId || null,
        appVersion: payload.appVersion || null,
        locale: payload.locale || (typeof navigator !== "undefined" ? navigator.language : null),
        timezone:
          payload.timezone ||
          (typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
            : null),
      };

      writeStoredPayload(normalized);
      if (!disposed) {
        await postToken(normalized);
      }
    };

    const unregisterToken = async (token: string) => {
      const clean = token.trim();
      if (!clean) return;
      await deleteToken(clean);

      const stored = readStoredPayload();
      if (stored?.token === clean) {
        removeStoredPayload();
      }
    };

    window.NUSTEventsPush = { registerToken, unregisterToken };

    const storedPayload = readStoredPayload();
    if (storedPayload) {
      void postToken(storedPayload).catch(() => {});
    }

    const onCustomEvent = (event: Event) => {
      const custom = event as CustomEvent<PushTokenPayload>;
      if (!custom.detail) return;
      void registerToken(custom.detail).catch(() => {});
    };

    window.addEventListener("nust:push-token", onCustomEvent as EventListener);

    return () => {
      disposed = true;
      window.removeEventListener(
        "nust:push-token",
        onCustomEvent as EventListener,
      );
      if (window.NUSTEventsPush) {
        delete window.NUSTEventsPush;
      }
    };
  }, []);

  return null;
}
