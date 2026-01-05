#!/usr/bin/env bash
# Simple helper: create .env from .env.example if missing and open $EDITOR or vi
if [ -f .env ]; then
  echo ".env already exists. Opening for edit..."
  ${EDITOR:-vi} .env
  exit 0
fi
cp .env.example .env
echo "Created .env from .env.example"
${EDITOR:-vi} .env

echo "Setup complete. Edit .env and then run: npm start"
