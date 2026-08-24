#!/usr/bin/env bash
set -euo pipefail

url="${1:-}"
cluster="${2:-}"
service="${3:-}"
duration="${4:-360}"
concurrency="${5:-24}"
region="${AWS_REGION:-us-west-2}"

if [[ -z "$url" || -z "$cluster" || -z "$service" ]]; then
  echo "Usage: $0 <url> <cluster> <service> [duration-seconds] [concurrency]" >&2
  exit 1
fi

service_counts() {
  aws ecs describe-services \
    --region "$region" \
    --cluster "$cluster" \
    --services "$service" \
    --query 'services[0].[desiredCount,runningCount,pendingCount]' \
    --output text
}

baseline="$(aws ecs describe-services \
  --region "$region" \
  --cluster "$cluster" \
  --services "$service" \
  --query 'services[0].desiredCount' \
  --output text)"

if [[ "$baseline" == "None" || -z "$baseline" ]]; then
  echo "ECS service was not found." >&2
  exit 1
fi

echo "Baseline desired tasks: $baseline"
echo "Generating CPU-heavy traffic for ${duration}s with concurrency ${concurrency}..."

end_time=$((SECONDS + duration))
pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 "$concurrency"); do
  (
    while (( SECONDS < end_time )); do
      curl --silent --output /dev/null --max-time 10 "${url}/work?ms=200" || true
    done
  ) &
  pids+=("$!")
done

scaled=false
while (( SECONDS < end_time )); do
  counts="$(service_counts)"
  desired="$(awk '{print $1}' <<<"$counts")"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) desired/running/pending: $counts"
  if (( desired > baseline )); then
    scaled=true
    break
  fi
  sleep 15
done

if [[ "$scaled" != true ]]; then
  echo "Service did not increase desired count during the test window." >&2
  exit 1
fi

echo "Scale-out observed: desired tasks increased from ${baseline} to ${desired}."

