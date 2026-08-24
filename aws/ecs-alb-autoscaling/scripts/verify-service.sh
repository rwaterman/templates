#!/usr/bin/env bash
set -euo pipefail

url="${1:-}"
attempts="${2:-30}"

if [[ -z "$url" ]]; then
  echo "Usage: $0 <load-balancer-url> [attempts]" >&2
  exit 1
fi

for attempt in $(seq 1 "$attempts"); do
  if response="$(curl --fail --silent --show-error --max-time 10 "${url}/" 2>/dev/null)"; then
    echo "$response"
    curl --fail --silent --show-error --max-time 10 "${url}/health"
    echo
    exit 0
  fi
  echo "Waiting for service (${attempt}/${attempts})..."
  sleep 10
done

echo "Service did not become healthy: $url" >&2
exit 1

