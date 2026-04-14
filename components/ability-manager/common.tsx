"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import JSZip from "jszip";
import { buildIconSrc as buildVersionedIconSrc } from "@lib/icon-src";

export type StatusTone = "neutral" | "success" | "error";

export type DismissibleStatusBannerProps = {
  tone: StatusTone;
  message: string;
  onDismiss?: () => void;
  dismissLabel?: string;
  countdownSeconds?: number | null;
};

export function buildIconSrc(icon: string | undefined, id: string, name: string, version?: string) {
  return buildVersionedIconSrc(icon, id, name, version);
}

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadZipBundle(filename: string, files: Record<string, string>) {
  const zip = new JSZip();
  for (const [filePath, contents] of Object.entries(files)) {
    zip.file(filePath, contents);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

type SummaryCardProps = {
  label: string;
  value: string | number;
  accent?: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function SummaryCard({ label, value, accent, active = false, href, onClick, disabled = false }: SummaryCardProps) {
  const className = `card w-full text-left transition ${
    onClick || href
      ? active
        ? "border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(125,211,252,0.12)]"
        : "hover:border-cyan-300/30 hover:bg-white/[0.04]"
      : ""
  } ${disabled ? "cursor-default opacity-55" : onClick || href ? "cursor-pointer" : ""}`;

  const contents = (
    <>
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {contents}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active} className={className}>
        {contents}
      </button>
    );
  }

  return <div className={className}>{contents}</div>;
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card space-y-4">
      <div>
        <div className="text-lg font-semibold text-white">{title}</div>
        {description ? <div className="mt-1 text-sm text-white/55">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusBanner({ tone, message }: { tone: StatusTone; message: string }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-400/30 bg-red-400/10 text-red-100"
          : tone === "success"
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-white/5 text-white/70"
      }`}
    >
      {message}
    </div>
  );
}

export function DismissibleStatusBanner({ tone, message, onDismiss, dismissLabel = "Dismiss", countdownSeconds = null }: DismissibleStatusBannerProps) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-red-400/30 bg-red-400/10 text-red-100"
          : tone === "success"
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-white/5 text-white/70"
      }`}
    >
      <div className="min-w-0 flex-1">{message}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded border border-current/25 px-3 py-1 text-xs font-medium hover:bg-white/10"
        >
          {dismissLabel}
          {countdownSeconds !== null ? ` (${countdownSeconds}s)` : ""}
        </button>
      ) : null}
    </div>
  );
}
