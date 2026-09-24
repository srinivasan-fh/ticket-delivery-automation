#!/bin/bash
# Idempotent setup, run automatically before `npm run dev` (predev) and by start.sh.
# Fast when everything is already installed; only (re)installs what is missing or stale.
set -e

PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$PROJECT_ROOT"

# Config - every integration stays simulated until real credentials are filled in.
if [ ! -f "backend/.env" ]; then
    echo "📝 Creating backend/.env from .env.example (fill in real credentials to go live)"
    cp .env.example backend/.env
fi

# Python venv - (re)create if missing or broken (e.g. a venv copied from another folder).
if ! backend/venv/bin/python -c "import sys" >/dev/null 2>&1; then
    echo "🐍 Creating backend/venv..."
    python3 -m venv --clear backend/venv
    rm -f backend/venv/.requirements-installed
fi

# Backend packages - reinstall whenever requirements.txt changes.
STAMP="backend/venv/.requirements-installed"
if [ ! -f "$STAMP" ] || [ backend/requirements.txt -nt "$STAMP" ] || ! backend/venv/bin/python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
    echo "📦 Installing backend requirements..."
    backend/venv/bin/python -m pip install --upgrade pip >/dev/null
    backend/venv/bin/python -m pip install -r backend/requirements.txt
    touch "$STAMP"
fi

# Node packages.
if [ ! -x "node_modules/.bin/concurrently" ]; then
    echo "📦 Installing root npm packages..."
    npm install
fi
if [ ! -d "frontend/node_modules" ] || [ frontend/package.json -nt frontend/node_modules ]; then
    echo "📦 Installing frontend packages..."
    npm install --prefix frontend
fi
