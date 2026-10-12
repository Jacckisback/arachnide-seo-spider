#!/bin/bash
# Arachnide SEO Spider — double-click launcher for Linux
cd "$(dirname "$0")" || exit 1
unset NODE_OPTIONS
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Please install the LTS version from https://nodejs.org"
  echo "Node.js n'est pas installé. Installez la version LTS depuis https://nodejs.org"
  echo "Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren."
  xdg-open "https://nodejs.org" >/dev/null 2>&1
  read -r -p "Press Enter to close…"
  exit 1
fi
[ -d node_modules ] || npm install || { read -r -p "npm install failed. Press Enter…"; exit 1; }
(sleep 2 && xdg-open "http://localhost:${PORT:-4000}" >/dev/null 2>&1) &
npm start
