# NIM PC v2 — Contexto para Antigravity (agy)

> **Léeme primero.** Este documento resume el estado REAL del proyecto a fecha
> 2026-08-21 (noche). Si trabajas con Antigravity (agy) en la PC de Nimrod,
> este es tu punto de partida. El plan detallado por fases está en
> `docs/plans/2026-08-21-nim-pc-v2.md` (su sección "Estado actual" quedó
> desactualizada — confía en ESTE documento).

## Qué es este proyecto

**NIM PC** es la app de escritorio (Tauri 2 + React 19 + Vite 6) que NIM — el
agente personal de Nimrod — usa para controlar la PC local de Nimrod y hablar
con el VPS (cerebro). El repo `Blaimmer/nim-hermes-frontend` contiene la app
completa: frontend React, shell Tauri (Rust) y el bridge WSS hacia el VPS.

## Arquitectura (3 capas)

```
┌─────────────────────────────────────────────────────────┐
│  NIM PC (Tauri + React) — la app en la PC de Nimrod      │
│  src/App.tsx (dashboard NIM, ~3400 líneas)               │
│  src/components/* (6 paneles UI)                         │
│  src-tauri/src/lib.rs (commands Rust: nim_*)             │
└──────────────┬──────────────────────────┬────────────────┘
               │ invoke (Tauri)           │ WSS bridge (:9876)
               ▼                          ▼
       PC local (Windows)          VPS 72.60.123.163
       nim_* commands              hermes serve (:9119, JSON-RPC)
       agy CLI, git, archivos      hermes gateway (:8642, Telegram)
```

- **Gateway :9119** — protocolo JSON-RPC/WS portado de Hermes Desktop (MIT).
  Se usa para UI/sesiones/chat: `src/lib/hermes/` (api-client, sessions,
  skills, cron, types...). Login: `POST /auth/password-login` user `nim`.
- **Bridge :9876** — WSS legacy cifrado (AES-256-GCM) para tools de la PC
  local. `nim_phase2/nim_wss_server.py` en el VPS + `src/lib/wss_client.ts`
  en la app. Plugin `nim-pc` en el VPS despacha las tools.
- **tauri-mock.ts** — IMPORTANTE: el alias de vite apunta
  `@tauri-apps/api/core` → `src/tauri-mock.ts`, que detecta
  `window.__TAURI_INTERNALS__` y delega al invoke nativo en la app real
  (fix crítico, commit 9cfda34). En navegador puro es no-op.

## Estado REAL (2026-08-21 noche) — F0, F1, F2, F3, F4 COMPLETAS

Commits en main (todos pusheados): `6ef100b` → `2ba68e8` (9 commits).
Build `npm run build` OK. Working tree limpio. 4 servicios VPS activos.

### F1 — Protocolo cliente (commit 3f89162, d3901a5)
Portado de Hermes Desktop (MIT): `src/lib/hermes/` — api-client, sessions,
cron, skills, toolsets, models, config, json-rpc-gateway, types (1514 líneas).
Smoke test validado contra serve real (login, 300 sesiones, 8 cron, 549 skills).

### F2 — UI (commits 3967b13 → 10787b7) — 6 paneles en el dashboard
Patrón de panel: botón en el aside (primera fila de tabs) con icono
lucide-react + acento de color + `showXxx` state + section panel colapsable.

| Panel | Archivo | Acento | Qué hace |
|-------|---------|--------|----------|
| CHAT | App.tsx (integrado) | cyan | chat vía bridge (:9876) + streaming |
| SESIONES | `src/components/sessions/SessionList.tsx` | violeta | lista sesiones VPS (gateway :9119) + resume |
| ARCHIVOS | `src/components/files/FileBrowser.tsx` | esmeralda | file browser local (nim_list_dir/filesystem/file_ops) |
| GIT | `src/components/git/GitReviewPane.tsx` | ámbar | status/diff/commit (nim_git_status/diff/commit) |
| TERMINAL | `src/components/terminal/TerminalPane.tsx` | fucsia | xterm + tauri-plugin-shell (spawn powershell/cmd/bash) |
| MEMORIA | `src/components/memory/MemoryGraphPane.tsx` | sky | star map real (getStarmapGraph) + skills VPS (getSkills) |

Deps nuevas en F2: `@xterm/xterm@6`, `@xterm/addon-fit@0.11`,
`tauri-plugin-shell=2` (Cargo.toml + capabilities `shell:allow-*`).

### F3 — Tools PC (commits 70bee9b, 6ef100b)
Commands Rust en `src-tauri/src/lib.rs`: nim_terminal, nim_filesystem,
nim_patch_file, nim_list_dir, nim_grep_search, nim_file_ops, nim_code_exec,
nim_checkpoint, nim_computer_use. Plugin nim-pc (VPS) con 10 tools.

### F4 — Antigravity (commits d35ffc5, da20da3)
- `nim_antigravity(prompt, cwd?, timeout_secs?)` → ejecuta `agy --print` en la
  PC. Si agy no está en PATH → error claro con instrucción de instalación.
- Panel AGY: `src/components/antigravity/AntigravityPanel.tsx` (naranja).
- Plugin nim-pc → **11 tools** (añadida nim_antigravity).

### Fix crítico (commit 9cfda34)
`src/tauri-mock.ts` — antes era no-op incondicional (todas las tools PC
muertas en la app real). Ahora delega a `window.__TAURI_INTERNALS__`.
También exporta `Channel` (plugin-shell lo importa del core).

## Commands Rust en lib.rs (validar compilación en la PC)

`nim_git_status(cwd)`, `nim_git_diff(cwd, path?, staged?)`,
`nim_git_commit(cwd, message)` — helpers `run_git` (git en PATH).
`nim_antigravity(prompt, cwd?, timeout_secs?)` — `agy --print`.
Todos devuelven `Result<String, String>` con JSON `{"stdout","stderr","exit_code"}`.

## LO QUE FALTA — F5 (requiere la PC de Nimrod)

1. **Build Tauri**: script `docs/scripts/build-f5.ps1` (PowerShell, PC Windows):
   git pull → npm install → `npm run tauri build` → .msi/.exe en
   `src-tauri/target/release/bundle/`.
2. **Validar compilación Rust nueva**: nim_git_status/diff/commit,
   nim_antigravity, tauri-plugin-shell — el VPS no tiene cargo, solo se
   compilan en la PC.
3. **Pruebas reales de los 6 paneles** (login VPS, file browser, git, terminal,
   memory graph, agy --print con auth Google en la PC).
4. Documentar resultados y commit final.

## Convenciones / reglas

- **Visual NIM**: oscuro/cyan (#22d3ee), font-mono, text-[7px]-[9.5px], clase
  "panel", inputs `bg-[#010912]`, scroll `custom-scrollbar`. Strings en ESPAÑOL.
- **No usar** radix-ui, cmdk, react-query, nanostores, motion — solo Tailwind
  inline + lucide-react.
- Commands Tauri devuelven JSON string → `JSON.parse()` siempre; en navegador
  (mock) devuelven null → manejar con mensaje.
- **Git**: pull antes de push (Antigravity y Hermes pueden pushear en paralelo).
- Documentar en `HERMES_INTEGRATION_LOG.md` + commit + push al finalizar.
