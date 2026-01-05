@echo off
echo =====================================
echo       VLCord Setup for Windows
echo =====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18.0.0 or higher from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js found
node --version

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not available
    echo Please ensure npm is installed with Node.js
    echo.
    pause
    exit /b 1
)

echo ✅ npm found
npm --version

echo.
echo 📦 Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    echo Please check your internet connection and try again
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ Dependencies installed successfully!

REM Check if .env file exists
if not exist ".env" (
    echo.
    echo 📝 Creating .env file from template...
    echo # VLCord Configuration > .env
    echo # Default project keys included - personal keys recommended for better performance >> .env
    echo TMDB_API_KEY=ccc1fa36a0821299ae4d7a6c155b442d >> .env
    echo DISCORD_CLIENT_ID=1392902149163319398 >> .env
    echo PORT=3000 >> .env
    echo VLC_HOST=localhost >> .env
    echo VLC_PORT=8080 >> .env
    echo VLC_PASSWORD=vlcpassword >> .env
    echo.
    echo 🚀 VLCord works with default keys, but HERE'S WHY you should get your own:
    echo.
    echo 💡 TMDb API Key Benefits:
    echo    ✅ No rate limits - unlimited movie/show lookups
    echo    ✅ Faster responses - dedicated quota just for you
    echo    ✅ Better reliability - no shared throttling
    echo    ✅ FREE and takes 2 minutes: https://www.themoviedb.org/settings/api
    echo.
    echo 🎮 Discord Client ID Benefits:
    echo    ✅ Custom app name in Discord - "YourName's VLCord" instead of generic
    echo    ✅ Your own app icon and branding
    echo    ✅ Independent from shared app quotas
    echo    ✅ FREE at: https://discord.com/developers/applications
    echo.
    echo 💬 Think of it like having your own Netflix account vs sharing one!
)

echo.
echo 🎯 Setup complete! Next steps:
echo.
echo 1. Configure your .env file with API keys
echo 2. Enable VLC Web Interface (see docs/vlc-connection-guide.md)
echo 3. Run 'npm start' to launch VLCord
echo.
echo 📚 For detailed setup instructions, see README.md
echo.
pause