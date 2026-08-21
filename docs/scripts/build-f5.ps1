# ── F5: Build Tauri NIM PC en la PC de Nimrod (Windows) ────────────────────
# El VPS NO puede compilar Tauri/Windows — este script corre en la PC de Nimrod
# (donde está Antigravity). Ejecutar en PowerShell como usuario normal.

# 1) Requisitos previos (una sola vez):
#    - Rust toolchain: https://rustup.rs (rustup-init.exe)
#    - Node.js 18+: https://nodejs.org
#    - Git for Windows (git en PATH)
#    - agy CLI:  agy install   (https://antigravity.dev)
#    - WebView2 (Windows 10/11 ya lo trae)

# 2) Clonar / actualizar el repo
cd $HOME
if (Test-Path nim-hermes-frontend) {
  cd nim-hermes-frontend
  git pull origin main
} else {
  git clone https://github.com/Blaimmer/nim-hermes-frontend.git
  cd nim-hermes-frontend
}

# 3) Dependencias
npm install
npm install @xterm/xterm @xterm/addon-fit   # si no quedaron en package-lock

# 4) BUILD TAURI (genera .msi / .exe en src-tauri/target/release/bundle/)
npm run tauri build

# 5) Pruebas rápidas tras arrancar la app:
#    - Panel SESIONES (violeta)  → login user nim + password → lista del VPS
#    - Panel ARCHIVOS (verde)    → navegar C:\ y leer un archivo
#    - Panel GIT (ámbar)         → abrir repo y ver status/diff/commit
#    - Panel TERMINAL (fucsia)   → CONECTAR → powershell interactivo
#    - Panel MEMORIA (sky)       → star map + skills del VPS
#    - Panel AGY (naranja)       → prompt → agy --print (requiere auth Google)

# 6) Si el build falla en Rust nuevo (nim_git_*, nim_antigravity, plugin-shell):
#    - Error de permisos → src-tauri/capabilities/default.json ya tiene shell:allow-*
#    - Error "agy not found" → instalar agy y asegurar PATH, reiniciar la app
#    - Reportar a NIM con el log: Get-Content src-tauri\target\release\bundle\msi\*.log
Write-Host "F5 listo — revisa src-tauri/target/release/bundle/ para el instalador"
