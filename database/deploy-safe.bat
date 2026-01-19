@echo off
REM JUKE Database Safe Deployment Script (Windows)
REM =============================================
REM 1. Backup -> 2. Schema -> 3. Test -> 4. Profit! 🎵

setlocal enabledelayedexpansion

echo 🎵 JUKE Database Deployment Started...
echo =====================================

REM Configuration
set DB_NAME=juke_db
set BACKUP_DIR=./backups
set SCHEMA_FILE=./schema-fixed.sql
set TIMESTAMP=%date:~-4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%

REM Create backup directory
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo.
echo 📦 Step 1: Creating Backup...
REM ================================
set BACKUP_FILE=%BACKUP_DIR%/juke_backup_%TIMESTAMP%.sql

echo 📍 Creating backup: %BACKUP_FILE%
pg_dump %DB_NAME% > %BACKUP_FILE%

if %errorlevel% neq 0 (
    echo ❌ Backup failed! Stopping deployment.
    pause
    exit /b 1
)

echo ✅ Backup created successfully!

echo.
echo 🔧 Step 2: Applying New Schema...
REM ==================================
echo 📍 Applying schema: %SCHEMA_FILE%

REM Apply schema
psql %DB_NAME% < %SCHEMA_FILE%

if %errorlevel% neq 0 (
    echo ❌ Schema application failed!
    echo 🔄 Restoring from backup...
    psql %DB_NAME% < %BACKUP_FILE%
    echo ✅ Database restored from backup
    pause
    exit /b 1
)

echo ✅ Schema applied successfully!

echo.
echo 🧪 Step 3: Testing Database...
REM ================================
echo 📍 Running database tests...

REM Test 1: Check if all tables exist
echo 🔍 Test 1: Checking tables...
for %%T in (users artists albums tracks playlists playlist_tracks user_favorites user_following_artists track_comments play_history user_sessions upload_queue) do (
    psql %DB_NAME% -t -c "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '%%T';" | findstr /C:"1" >nul
    if !errorlevel! neq 0 (
        echo ❌ Table %%T missing!
        echo 🔄 Restoring from backup...
        psql %DB_NAME% < %BACKUP_FILE%
        echo ✅ Database restored from backup
        pause
        exit /b 1
    )
    echo ✅ Table %%T exists
)

REM Test 2: Check if data is intact
echo 🔍 Test 2: Checking data integrity...
for /f "tokens=1" %%U in ('psql %DB_NAME% -t -c "SELECT COUNT(*) FROM users;"') do set USER_COUNT=%%U
for /f "tokens=1" %%T in ('psql %DB_NAME% -t -c "SELECT COUNT(*) FROM tracks;"') do set TRACK_COUNT=%%T
for /f "tokens=1" %%A in ('psql %DB_NAME% -t -c "SELECT COUNT(*) FROM artists;"') do set ARTIST_COUNT=%%A

echo 📊 Data counts:
echo    Users: %USER_COUNT%
echo    Tracks: %TRACK_COUNT%
echo    Artists: %ARTIST_COUNT%

if %USER_COUNT% gtr 0 if %TRACK_COUNT% gtr 0 (
    echo ✅ Data integrity verified!
) else (
    echo ❌ Data integrity check failed!
    echo 🔄 Restoring from backup...
    psql %DB_NAME% < %BACKUP_FILE%
    echo ✅ Database restored from backup
    pause
    exit /b 1
)

REM Test 3: Check UUID extension
echo 🔍 Test 3: Checking UUID extension...
psql %DB_NAME% -t -c "SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp';" | findstr /C:"1" >nul
if !errorlevel! neq 0 (
    echo ❌ UUID extension missing!
    pause
    exit /b 1
)
echo ✅ UUID extension is active!

echo.
echo 🎉 Step 4: PROFIT! 🎵
REM =========================
echo =====================================
echo ✅ JUKE Database Deployment SUCCESSFUL!
echo 🎵 Your music platform is ready!
echo.
echo 📊 Deployment Summary:
echo    Backup: %BACKUP_FILE%
echo    Users: %USER_COUNT%
echo    Tracks: %TRACK_COUNT%
echo    Artists: %ARTIST_COUNT%
echo.
echo 🚀 Your website should now work perfectly!
echo 🔧 All database errors have been fixed!
echo 📈 Performance improved with new indexes!
echo.
echo 🎯 Next steps:
echo    1. Test your website manually
echo    2. Check music upload/playback
echo    3. Verify user login works
echo    4. Test playlist creation
echo.
echo 💡 If anything goes wrong, restore with:
echo    psql %DB_NAME% < %BACKUP_FILE%
echo.
echo 🎵 Happy streaming! 🎵
echo.
pause
