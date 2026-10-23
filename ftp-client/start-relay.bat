@echo off
rem APP UP FTP Manager relay (Windows)
cd /d %~dp0server
if not exist node_modules (
  echo First-time setup...
  call npm install --omit=dev
)
node server.js
pause
