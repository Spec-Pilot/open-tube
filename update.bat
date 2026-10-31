@echo off
setlocal enabledelayedexpansion
title OpenTube AdShield - In-Place Updater

echo ========================================================
echo        OpenTube AdShield - One-Click Updater
echo ========================================================
echo.

:: Check if git is available in PATH and this is a git repo
where git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    if exist ".git" (
        echo [*] Git repository detected. Pulling latest updates from GitHub...
        git pull origin main
        if !ERRORLEVEL! EQU 0 (
            echo.
            echo [OK] OpenTube AdShield successfully updated to latest version!
            echo [i] In Chrome, navigate to chrome://extensions and click the reload icon on OpenTube.
            echo.
            goto :finish
        ) else (
            echo [!] Git pull encountered a conflict, falling back to direct download...
        )
    )
)

echo [*] Downloading latest release from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/Spec-Pilot/open-tube/archive/refs/heads/main.zip' -OutFile 'update_temp.zip'"

if exist "update_temp.zip" (
    echo [*] Extracting files directly into extension folder...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'update_temp.zip' -DestinationPath 'update_temp_dir' -Force"
    
    if exist "update_temp_dir\open-tube-main" (
        xcopy /E /Y /Q "update_temp_dir\open-tube-main\*" "." >nul
    )
    
    :: Cleanup temp files
    rmdir /S /Q "update_temp_dir" >nul 2>nul
    del /F /Q "update_temp.zip" >nul 2>nul

    echo.
    echo [OK] All extension files updated in-place successfully!
    echo [i] In Chrome, navigate to chrome://extensions and click the reload icon on OpenTube.
    echo.
) else (
    echo.
    echo [ERROR] Failed to download update. Please verify your internet connection.
    echo.
)

:finish
echo Press any key to exit...
pause >nul
