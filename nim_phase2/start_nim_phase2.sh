#!/usr/bin/env bash
# Nim Phase 2 — Launcher del Servidor WSS
# Inicia todos los servicios de la Fase 2:
#   1. Servidor WebSocket Seguro (WSS)
#   2. (Opcional) Cloudflare Tunnel para exponer WSS públicamente
#
# Uso:
#   ./start_nim_phase2.sh              # ws://localhost:9876
#   ./start_nim_phase2.sh --ssl        # wss://localhost:9876 (cert autofirmado)
#   ./start_nim_phase2.sh --tunnel     # wss:// via Cloudflare Tunnel
#   ./start_nim_phase2.sh --ssl --tunnel  # wss:// local + Cloudflare

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

USE_SSL=false
USE_TUNNEL=false
WSS_PORT=9876
WSS_HOST="0.0.0.0"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ssl) USE_SSL=true; shift ;;
        --tunnel) USE_TUNNEL=true; shift ;;
        --port) WSS_PORT="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# ─── 1. Verificar contraseña maestra ───
if [ ! -f ".nim_master_password" ]; then
    echo "❌ No se encontró .nim_master_password"
    echo "   Ejecuta: python3 -c \"import secrets; print(secrets.token_urlsafe(32))\" > .nim_master_password"
    exit 1
fi

export NIM_MASTER_PASSWORD=$(grep -v '^#' .nim_master_password | grep -v '^$' | tail -1)
FINGERPRINT=$(python3 -c "
from nim_e2ee import NimE2EE
print(NimE2EE.verify_key_fingerprint('$NIM_MASTER_PASSWORD'))
")

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          NIM PHASE 2 — WebSocket Seguro (WSS)                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║ Key Fingerprint: $FINGERPRINT           ║"
echo "║ WSS Port:        $WSS_PORT                                         ║"
echo "║ SSL:             $([ "$USE_SSL" = true ] && echo '✅ Habilitado' || echo '❌ Deshabilitado (ws://)')                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Verificar fingerprint con el usuario
echo "⚠️  IMPORTANTE: Este fingerprint DEBE coincidir con el de Nim PC."
echo "   Fingerprint: $FINGERPRINT"
echo ""

# ─── 2. Construir argumentos del servidor ───
WSS_ARGS="--host $WSS_HOST --port $WSS_PORT"

if [ "$USE_SSL" = true ]; then
    WSS_ARGS="$WSS_ARGS --ssl-cert nim_wss_cert.pem --ssl-key nim_wss_key.pem"
fi

# ─── 3. Iniciar Cloudflare Tunnel (si se solicita) ───
if [ "$USE_TUNNEL" = true ]; then
    echo "Iniciando Cloudflare Tunnel..."
    cloudflared tunnel --url "http://localhost:$WSS_PORT" \
        --name nim-phase2-wss &
    TUNNEL_PID=$!
    echo "Cloudflare Tunnel PID: $TUNNEL_PID"
    sleep 3
    # La URL se mostrará en la salida de cloudflared
fi

# ─── 4. Iniciar servidor WSS ───
echo ""
echo "🚀 Iniciando Nim WSS Server..."
echo "   Comando: python3 nim_wss_server.py $WSS_ARGS"
echo ""

# Capturar señales para limpieza
cleanup() {
    echo ""
    echo "🛑 Deteniendo servicios..."
    if [ -n "${TUNNEL_PID:-}" ]; then
        kill $TUNNEL_PID 2>/dev/null || true
    fi
    exit 0
}
trap cleanup SIGINT SIGTERM

python3 nim_wss_server.py $WSS_ARGS

# Limpieza al salir
cleanup
