@echo off
REM VLCord Quick-Start Deployment Script (Windows)
REM Automates setup and deployment process

setlocal enabledelayedexpansion

echo =========================================
echo VLCord Quick-Start Deployment
echo =========================================
echo.

REM Colors (using findstr for colored output)
REM Check if Node.js is installed
echo [1/7] Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo OK: Node.js %NODE_VERSION% detected
echo.

REM Check if npm is installed
echo [2/7] Checking npm installation...
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo OK: npm %NPM_VERSION% detected
echo.

REM Copy .env.example if .env doesn't exist
echo [3/7] Setting up environment configuration...
if not exist .env (
    if exist .env.example (
        copy .env.example .env
        echo OK: Created .env from template
    ) else (
        (
            echo WEB_PORT=7100
            echo NODE_ENV=development
            echo DISCORD_CLIENT_ID=your-discord-client-id
            echo VLCORD_ADMIN_TOKEN=your-secure-token
            echo TMDB_API_KEY=your-tmdb-api-key
            echo VLC_HOST=localhost
            echo VLC_PORT=8080
            echo REDIS_ENABLED=false
        ) > .env
        echo WARNING: Created basic .env file
    )
    echo.
    echo ATTENTION: Please edit .env with your actual credentials
    echo Edit .env with your favorite text editor
    pause
) else (
    echo OK: .env file already exists
)
echo.

REM Install dependencies
echo [4/7] Installing dependencies...
if not exist node_modules (
    call npm install
    echo OK: Dependencies installed
) else (
    echo OK: Dependencies already installed
)
echo.

REM Check for Redis (optional)
echo [5/7] Checking Redis availability (optional^)...
where redis-cli >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo OK: Redis CLI found
    redis-cli ping >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo OK: Redis server is running
        echo To enable caching, set REDIS_ENABLED=true in .env
    ) else (
        echo WARNING: Redis CLI found but server not running
        echo To start Redis, use: redis-server
        echo Or use Docker: docker run -d -p 6379:6379 redis:latest
    )
) else (
    where docker >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo WARNING: Redis not found, but Docker is available
        echo To use Redis with Docker:
        echo docker run -d -p 6379:6379 --name vlcord-redis redis:latest
    ) else (
        echo WARNING: Redis not installed (optional, caching disabled^)
    )
)
echo.

REM Validate configuration
echo [6/7] Validating configuration...
set ERRORS=0

findstr /M "your-discord-client-id" .env >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ERROR: DISCORD_CLIENT_ID not configured
    set /a ERRORS=!ERRORS!+1
)

findstr /M "your-secure-token" .env >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ERROR: VLCORD_ADMIN_TOKEN not configured
    set /a ERRORS=!ERRORS!+1
)

findstr /M "your-tmdb-api-key" .env >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ERROR: TMDB_API_KEY not configured
    set /a ERRORS=!ERRORS!+1
)

if %ERRORS% GTR 0 (
    echo.
    echo Please configure missing environment variables in .env
    pause
    exit /b 1
)

echo OK: Configuration validated
echo.

REM Ready to start
echo [7/7] Deployment preparation complete!
echo.
echo =========================================
echo Ready to start VLCord!
echo =========================================
echo.
echo Next steps:
echo 1. Review your configuration:
echo    type .env
echo.
echo 2. Start the application:
echo    npm start
echo.
echo 3. Access the dashboard:
echo    http://localhost:7100
echo.
echo 4. (Optional^) Install PM2 for production:
echo    npm install -g pm2
echo    pm2 start ecosystem.config.js
echo.
echo For detailed deployment instructions, see DEPLOYMENT.md
echo.

set /p START="Do you want to start the application now? (y/n): "
if /i "%START%"=="y" (
    echo Starting VLCord...
    call npm start
)

pause
