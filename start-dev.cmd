@echo off
set PATH=C:\Program Files\nodejs;%PATH%
node scripts/prebuild.mjs
node_modules\.bin\next dev
