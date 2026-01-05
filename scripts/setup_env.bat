@echo off
REM Simple helper: create .env from .env.example if missing and open Notepad for editing
if exist .env (
  echo .env already exists. Opening for edit...
  start notepad .env
  goto :eof
)
copy .env.example .env
echo Created .env from .env.example
echo Opening .env for editing...
start notepad .env

echo Setup complete. Edit .env and then run "npm start".
pause
