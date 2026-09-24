#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Developer Automation Portal setup & run..."

# Navigate to project root
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

# Seed a real config file on first run - every integration falls back to simulated mode on
# its own if its keys are left blank, so this is safe to run with zero credentials filled in.
if [ ! -f "backend/.env" ]; then
    echo "📝 No backend/.env found - copying from .env.example (fill in real credentials later to go live)"
    cp .env.example backend/.env
fi

# Setup Python Virtual Environment
echo "🐍 Setting up Python Virtual Environment..."
if [ ! -d "backend/venv" ]; then
    python3 -m venv backend/venv
fi

# Activate venv and install dependencies
source backend/venv/bin/activate
echo "📦 Installing backend requirements..."
pip install --upgrade pip
pip install -r backend/requirements.txt

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd "$PROJECT_ROOT"

# Run concurrently
echo "✨ Starting backend and frontend dev servers..."
npm install
npm run dev
