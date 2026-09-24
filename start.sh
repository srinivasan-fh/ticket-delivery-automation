#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Developer Automation Portal setup & run..."

# Navigate to project root
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

# Create backend/.env, backend/venv and install packages (skips whatever is already done).
bash scripts/setup.sh

# Run concurrently
echo "✨ Starting backend and frontend dev servers..."
npm run dev
