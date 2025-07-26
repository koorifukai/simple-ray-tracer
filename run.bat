@echo off

:start
cls
echo.
echo 🔬 Optical Design Ray Tracer
echo ============================
echo.
echo Choose an option:
echo.
echo   1. 🧪 Run Ground Truth Tests (Console)
echo   2. 🌐 Start Development Server (Browser)  
echo   3. 🏗️  Build Production
echo   4. 🔍 Lint Code
echo   5. ❌ Exit
echo.

set /p choice=Enter your choice (1-5): 

if "%choice%"=="1" (
    echo.
    echo 🧪 Running Ground Truth Validation Tests...
    npm run test
    echo.
    echo ✅ Tests completed! Press any key to return to menu...
    pause >nul
    goto start
)

if "%choice%"=="2" (
    echo.
    echo 🌐 Starting Development Server...
    echo 📝 Press Ctrl+C to stop the server and return to menu
    npm run dev
    echo.
    echo 🔄 Development server stopped. Press any key to return to menu...
    pause >nul
    goto start
)

if "%choice%"=="3" (
    echo.
    echo 🏗️ Building Production...
    npm run build
    echo.
    echo ✅ Build completed! Press any key to return to menu...
    pause >nul
    goto start
)

if "%choice%"=="4" (
    echo.
    echo 🔍 Linting Code...
    npm run lint
    echo.
    echo ✅ Linting completed! Press any key to return to menu...
    pause >nul
    goto start
)

if "%choice%"=="5" (
    echo.
    echo 👋 Goodbye!
    exit /b 0
)

echo.
echo ❌ Invalid choice. Please enter 1, 2, 3, 4, or 5.
echo Press any key to try again...
pause >nul
goto start
