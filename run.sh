#!/usr/bin/env bash
# One command to play Neon Runner.
#
#   ./run.sh            # serve on :8000
#   ./run.sh 8010       # serve on another port
#
# Prints the LAN URL too, so you can open the game on a phone on the same wifi,
# and VERIFIES the server actually answers before telling you it's ready.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8000}"
# Overridable so the verifier can be pointed at another page (and so tests can
# drive the failure branch): GAME=/public/ ./run.sh 8011
GAME="${GAME:-/public/three-game/}"

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

# HTTP status of a URL as three digits; 000 means never got an answer.
# Node, not curl, because node is guaranteed here and curl is not.
http_probe() {
  URL="$1" node --input-type=module -e '
    try {
      const res = await fetch(process.env.URL, { signal: AbortSignal.timeout(2000) });
      process.stdout.write(String(res.status));
    } catch {
      process.stdout.write("000");
    }
  ' 2>/dev/null || echo "000"
}

IP="$(lan_ip)"

url_line() {
  printf '  %-18s %s\n' "$1" "$2"
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

echo "> Neon Runner - Ctrl-C to stop."
if [ -n "${IP}" ]; then
  url_line "phone, same wifi" "http://${IP}:${PORT}${GAME}"
else
  echo "  (no LAN address found - phone URL unavailable)"
fi
echo "  every request logs below; no lines = the browser never reached the server."

# Start the server as a child (not exec) so we can verify it, then hand the
# terminal over to its request log.
PORT="${PORT}" node scripts/serve.js &
SRV=$!

cleanup() { kill "${SRV}" 2>/dev/null || true; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

# Wait for the page AND one ES module. A 200 on the HTML alone used to be a
# green light for a game whose modules were 404/refused — the module is the
# part that is actually the game.
check_url() {
  local label="$1" url="$2" code="" attempt=0
  while [ ${attempt} -lt 20 ]; do
    code="$(http_probe "${url}")"
    case "${code}" in
      200) url_line "${label}" "OK ${code}"; return 0 ;;
      000 | "") : ;; # nothing listening yet - retry
      *) break ;; # answered but wrong - retrying won't help
    esac
    # Bail instantly if the server died (port race, bad path, syntax error).
    kill -0 "${SRV}" 2>/dev/null || break
    attempt=$((attempt + 1))
    sleep 0.15
  done
  LAST_CODE="${code}"
  url_line "${label}" "FAILED ${code:-000}"
  return 1
}

LAST_CODE=""
if ! check_url "page" "http://127.0.0.1:${PORT}${GAME}"; then ok=0; else ok=1; fi
if ! check_url "game module" "http://127.0.0.1:${PORT}/src/three-game/main.js"; then ok=0; fi

if [ "${ok}" -ne 1 ]; then
  # The code is the diagnosis, so say which one it was.
  case "${LAST_CODE:-000}" in
    000 | "") echo "x nothing answered on port ${PORT} - the server died on startup."
              echo "  most often: the port got taken a second before we bound it."
              echo "  (a browser hitting this port now shows ERR_CONNECTION_REFUSED)" ;;
    404)      echo "x the server IS up, but ${GAME} is not a page on it - wrong path," 
              echo "  not a broken game. Check the folder name."
              echo "  the game lives at /public/three-game/" ;;
    *)        echo "x the server answered ${LAST_CODE} instead of 200 - see the lines above." ;;
  esac
  echo "  nothing was left running. Other port? ./run.sh 8001"
  exit 1
fi

url_line "this machine" "http://localhost:${PORT}${GAME}"
echo "> ready"

code=0
wait "${SRV}" || code=$?
exit "${code}"
