@echo off
echo Creating Youtube-Helper-Chrome-Plugin.zip...

:: Create build folder if it doesn't exist
if not exist "build" mkdir "build"

:: Delete existing zip if it exists
if exist "build\Youtube-Helper-Chrome-Plugin.zip" del "build\Youtube-Helper-Chrome-Plugin.zip"

:: Create zip using PowerShell (available on Windows 10+)
powershell -Command "Compress-Archive -Path 'extension\*' -DestinationPath 'build\Youtube-Helper-Chrome-Plugin.zip' -Force"

if exist "build\Youtube-Helper-Chrome-Plugin.zip" (
    echo Done! Created build\Youtube-Helper-Chrome-Plugin.zip
) else (
    echo Error: Failed to create zip file
)

pause
