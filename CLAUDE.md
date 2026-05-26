# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
npm start        # launches the Electron desktop window
```

There are no tests or lint scripts. The only dependency is `electron` (dev).

## Architecture

This is a single-window Electron app with three process layers:

| File | Process | Role |
|------|---------|------|
| `main.js` | Main | Creates the `BrowserWindow` (420×580, non-resizable, `titleBarStyle: 'hiddenInset'`); handles `ipcMain.on('notify')` to fire native `Notification` |
| `preload.js` | Preload | Runs with Node access; exposes `window.electronAPI.notify(title, body)` to the renderer via `contextBridge` |
| `renderer.js` | Renderer | All timer logic, DOM manipulation, and `localStorage` persistence — no Node APIs |
| `index.html` + `styles.css` | Renderer | UI markup and dark-theme CSS variables (`--accent` switches per mode) |

**IPC flow:** `renderer.js` → `window.electronAPI.notify()` → `preload.js` `ipcRenderer.send('notify')` → `main.js` `ipcMain.on('notify')` → `new Notification().show()`

## Key Logic in renderer.js

- **Three modes:** `work` (25 min), `short` (5 min), `long` (15 min). Body class `mode-work/short/long` drives `--accent` color.
- **Cycle accounting:** `pomodorosDone` tracks completions within a cycle. Every 4th work session (`pomodorosDone % 4 === 0`) triggers a long break. Both `onSessionComplete()` and `skipSession()` must increment `pomodorosDone` before the modulo check to avoid double long-break bugs.
- **Ring progress:** SVG `stroke-dashoffset = CIRCUMFERENCE * (1 - remaining/totalSeconds)` where `CIRCUMFERENCE = 2π×96 ≈ 603`.
- **Persistence:** `todayCount`, `totalCount`, `lastDate` stored in `localStorage` via `saveStat`/`loadStat`. Cross-midnight reset is detected in `onSessionComplete` by comparing a fresh `new Date().toLocaleDateString()` against the module-load snapshot `today`.
- **Tick guard:** `tick()` checks `if (!running) return` to discard queued `setInterval` callbacks that fire after `pause()`.

## Electron Binary Note

The Electron binary lives in `node_modules/electron/dist/`. If it is missing after `npm install` (download failure), manually place the correct `electron-vX.Y.Z-darwin-arm64` binaries there and write the relative path (no trailing newline) to `node_modules/electron/path.txt`:

```bash
printf "Electron.app/Contents/MacOS/Electron" > node_modules/electron/path.txt
```
