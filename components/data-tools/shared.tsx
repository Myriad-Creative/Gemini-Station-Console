"use client";

import { ClipboardEvent } from "react";

export type StatusTone = "neutral" | "success" | "error";

export function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
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
  children: React.ReactNode;
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
  const classes =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : tone === "error"
        ? "border-red-400/20 bg-red-400/10 text-red-100"
        : "border-white/10 bg-white/5 text-white/75";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{message}</div>;
}

export async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
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
  } finally {
    document.body.removeChild(textarea);
  }
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

export function mergeTextareaPaste(currentValue: string, pastedText: string, selectionStart: number | null, selectionEnd: number | null) {
  const start = selectionStart ?? currentValue.length;
  const end = selectionEnd ?? currentValue.length;
  return `${currentValue.slice(0, start)}${pastedText}${currentValue.slice(end)}`;
}

export function autoLoadPastedJson(
  event: ClipboardEvent<HTMLTextAreaElement>,
  currentValue: string,
  onChange: (nextValue: string) => void,
  onAutoLoad: (nextValue: string) => void,
) {
  const pastedText = event.clipboardData.getData("text");
  const nextValue = mergeTextareaPaste(currentValue, pastedText, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  event.preventDefault();
  onChange(nextValue);
  if (nextValue.trim()) onAutoLoad(nextValue);
}

export function JsonTextArea({
  label,
  value,
  rows = 10,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  onChange: (nextValue: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="label">{label}</div>
      <textarea className="input min-h-[160px] font-mono text-sm" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
