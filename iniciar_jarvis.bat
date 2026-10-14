@echo off
REM Inicia a Antena (server.js) minimizada e abre o Jarvis no Edge
cd /d "%~dp0"
netstat -ano | findstr ":4242" | findstr "LISTENING" >nul
if errorlevel 1 (
  start "Jarvis Antena" /min node server.js
  timeout /t 1 /nobreak >nul
)
start "" msedge "%~dp0jarvis.html"
