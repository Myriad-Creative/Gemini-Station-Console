"use client";

import { useEffect, useState } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";
import type { AbilityManagerDatabase } from "@lib/ability-manager/types";

export function useAbilityDatabase() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [database, setDatabase] = useState<AbilityManagerDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/abilities/database");
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok || !payload.database) {
          if (!cancelled) {
            setDatabase(null);
            setError(payload.error || "Could not load abilities or status effects from the local game root.");
          }
          return;
        }

        if (cancelled) return;
        setDatabase(payload.database as AbilityManagerDatabase);
        setError(null);
      } catch (nextError) {
        if (cancelled) return;
        setDatabase(null);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  return { database, loading, error };
}

