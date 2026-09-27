#!/usr/bin/env bash
# One command to play Neon Runner.
#
#   ./run.sh            # serve on :8000
#   ./run.sh 8010       # serve on another port
#
# Prints the LAN URL too, so you can open the game on a phone on the same wifi.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8000}"
GAME="/public/three-game/"

# First sensible LAN IPv4: real wifi/NIC names before anything virtual (docker0 etc).
lan_ip() {
  node --input-type=module -e '
    import { networkInterfaces } from "node:os";
    const names = Object.entries(networkInterfaces());
    const pick = (re) => {
      for (const [name, list] of names) {
        if (!re.test(name)) continue;
        const ip = (list || []).find((a) => a.family === "IPv4" && !a.internal);
        if (ip) return ip.address;
      }
      return "";
    };
    console.log(pick(/^wl/) || pick(/^en/) || pick(/^eth/) || pick(/^usb/));
  ' 2>/dev/null || true
}

IP="$(lan_ip)"

url_line() {
  printf '  %-16s %s\n' "$1" "$2"
}

if (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null; then
  echo "x port ${PORT} is already taken - an older server is probably still up."
  url_line "this machine" "http://localhost:${PORT}${GAME}"
  if [ -n "${IP}" ]; then url_line "your phone" "http://${IP}:${PORT}${GAME}"; fi
  url_line "other port" "./run.sh 8001"
  exit 1
fi

if [ ! -d node_modules/three ]; then
  echo "> three.js is missing - installing dependencies once."
  npm install --no-audit --no-fund
fi

# serve.js prints the localhost URLs; we add the one it can't - the LAN address.
echo "> Neon Runner - Ctrl-C to stop."
if [ -n "${IP}" ]; then
  url_line "phone, same wifi" "http://${IP}:${PORT}${GAME}"
else
  echo "  (no LAN address found - phone URL unavailable)"
fi

exec env PORT="${PORT}" node scripts/serve.js
