"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSharedDataWorkspaceVersion } from "@lib/shared-upload-client";

type SourceStatusPayload = {
  localGameSource?: {
    active: boolean;
    gameRootPath: string | null;
    lastValidated: string | null;
  };
  uploadedData?: {
    active: boolean;
  };
  uploadedAssets?: {
    active: boolean;
  };
};

const EMPTY_PAYLOAD: SourceStatusPayload = {
  localGameSource: {
    active: false,
    gameRootPath: null,
    lastValidated: null,
  },
  uploadedData: {
    active: false,
  },
  uploadedAssets: {
    active: false,
  },
};

export default function SourceStatus() {
  const sharedDataVersion = useSharedDataWorkspaceVersion();
  const [payload, setPayload] = useState<SourceStatusPayload>(EMPTY_PAYLOAD);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/settings");
        const nextPayload = (await response.json().catch(() => ({}))) as SourceStatusPayload;
        if (!cancelled) {
          setPayload({
            localGameSource: nextPayload.localGameSource ?? EMPTY_PAYLOAD.localGameSource,
            uploadedData: nextPayload.uploadedData ?? EMPTY_PAYLOAD.uploadedData,
            uploadedAssets: nextPayload.uploadedAssets ?? EMPTY_PAYLOAD.uploadedAssets,
          });
        }
      } catch {
        if (!cancelled) {
          setPayload(EMPTY_PAYLOAD);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sharedDataVersion]);

  const localSource = payload.localGameSource ?? EMPTY_PAYLOAD.localGameSource!;
  const uploadedData = payload.uploadedData ?? EMPTY_PAYLOAD.uploadedData!;
  const uploadedAssets = payload.uploadedAssets ?? EMPTY_PAYLOAD.uploadedAssets!;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/65 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label !mb-0">Source</span>
          <span
            className={`rounded-full px-2 py-1 text-[11px] ${
              localSource.active ? "bg-emerald-400/15 text-emerald-100" : "bg-white/5 text-white/60"
            }`}
          >
            {localSource.active ? "Local Game Root Active" : "No Local Game Root"}
          </span>
          {!localSource.active && (uploadedData.active || uploadedAssets.active) ? (
            <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-[11px] text-cyan-100">Using Uploaded Fallbacks</span>
          ) : null}
        </div>

        <div className="mt-1 min-w-0 font-mono text-[11px] text-white/75">
          {localSource.gameRootPath || "No Gemini Station folder is currently configured."}
        </div>

        {localSource.lastValidated ? (
          <div className="mt-1 text-[11px] text-white/45">Validated {new Date(localSource.lastValidated).toLocaleString()}</div>
        ) : null}
      </div>

      <div className="shrink-0">
        <Link href="/settings" className="rounded border border-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5 hover:text-white">
          Open Settings
        </Link>
      </div>
    </div>
  );
}
