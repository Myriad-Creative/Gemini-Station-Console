"use client";

import { useEffect, useState } from "react";

const SHARED_DATA_WORKSPACE_STORAGE_KEY = "gemini.console.shared-data-workspace.version.v1";
const SHARED_DATA_WORKSPACE_EVENT = "gemini:shared-data-workspace-updated";

function readSharedDataWorkspaceVersion() {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(SHARED_DATA_WORKSPACE_STORAGE_KEY) ?? "0";
}

export function publishSharedDataWorkspaceUpdate() {
  if (typeof window === "undefined") return;
  const next = String(Date.now());
  window.localStorage.setItem(SHARED_DATA_WORKSPACE_STORAGE_KEY, next);
  window.dispatchEvent(new CustomEvent(SHARED_DATA_WORKSPACE_EVENT, { detail: next }));
}

export function useSharedDataWorkspaceVersion() {
  const [version, setVersion] = useState("0");

  useEffect(() => {
    const sync = () => setVersion(readSharedDataWorkspaceVersion());
    sync();

    const onStorage = (event: StorageEvent) => {
      if (event.key === SHARED_DATA_WORKSPACE_STORAGE_KEY) {
        setVersion(event.newValue ?? "0");
      }
    };

    window.addEventListener(SHARED_DATA_WORKSPACE_EVENT, sync as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SHARED_DATA_WORKSPACE_EVENT, sync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return version;
}
