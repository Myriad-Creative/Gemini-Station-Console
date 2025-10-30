#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"
if command -v xattr >/dev/null 2>&1; then
  xattr -r -d com.apple.quarantine . 2>/dev/null || true
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install from https://nodejs.org/"
  read -p "Press Return to exit…" _
  exit 1
fi
echo "Installing dependencies (first run may take a minute)…"
npm install
open "http://localhost:3000" >/dev/null 2>&1 || true
npm run dev
