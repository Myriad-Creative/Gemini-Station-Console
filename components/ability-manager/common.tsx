"use client";

import type { ReactNode } from "react";
import JSZip from "jszip";

export type StatusTone = "neutral" | "success" | "error";

export function buildIconSrc(icon: string | undefined, id: string, name: string) {
  const params = new URLSearchParams({
    res: icon || "icon_lootbox.png",
    id,
    name,
  });
  return `/api/icon?${params.toString()}`;
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

export function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
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

