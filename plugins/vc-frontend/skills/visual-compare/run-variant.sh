#!/usr/bin/env bash
# Builds one checkout (unless dist/ exists), serves it with `vite preview`, captures it, stops the server.
#
#   run-variant.sh <variant> <checkout dir> <shots dir> <scenarios file> [extra capture.mjs args…]
#
# PORT (default 3100) must be free: a server left on it would be captured instead of this build, and
# `--strictPort` alone does not stop the capture. One build at a time.
set -uo pipefail
variant=$1; dir=$2; shots=$3; scenarios=$4; shift 4
port=${PORT:-3100}
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$shots"; shots=$(cd "$shots" && pwd); scenarios=$(cd "$(dirname "$scenarios")" && pwd)/$(basename "$scenarios")
cd "$dir" || exit 1

if [ ! -f dist/index.html ]; then
  yarn build-only > "$shots/build-$variant.log" 2>&1 || { echo "build failed: $variant (see $shots/build-$variant.log)"; exit 1; }
fi
if curl -sk -o /dev/null "https://localhost:$port/" || curl -s -o /dev/null "http://localhost:$port/"; then
  echo "port $port is busy: stop that server first"; exit 1
fi

npx vite preview --port "$port" --strictPort > "$shots/preview-$variant.log" 2>&1 &
for _ in $(seq 1 60); do
  grep -q "Local:.*:$port" "$shots/preview-$variant.log" && break
  sleep 1
done
url=$(grep -o "https\?://localhost:$port" "$shots/preview-$variant.log" | head -1)
[ -n "$url" ] || { echo "preview did not start (see $shots/preview-$variant.log)"; exit 1; }

node "$here/capture.mjs" --variant "$variant" --base "$url" --out "$shots" --scenarios "$scenarios" "$@"

# npx exits before vite does; stop whatever holds the port.
pid=$(ss -ltnp 2>/dev/null | sed -n "s/.*:$port .*pid=\([0-9]*\).*/\1/p" | head -1)
[ -z "$pid" ] && pid=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | head -1)
[ -n "$pid" ] && kill "$pid"
echo "done $variant"
