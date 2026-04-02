"use client";

import { useEffect, useState } from "react";

export const MISSION_LAB_SESSION_STORAGE_KEY = "gemini.console.mission-lab.session.v1";

export function getOrCreateMissionLabSessionId() {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(MISSION_LAB_SESSION_STORAGE_KEY);
  if (stored) return stored;

  const nextSessionId = window.crypto?.randomUUID?.() ?? `mission-lab-${Date.now()}`;
  window.localStorage.setItem(MISSION_LAB_SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}

export function useMissionLabSessionId() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    setSessionId(getOrCreateMissionLabSessionId());
  }, []);

  return sessionId;
}

export function buildMissionLabSessionHeaders(sessionId: string | null) {
  return sessionId ? ({ "x-mission-lab-session": sessionId } as Record<string, string>) : ({} as Record<string, string>);
}
