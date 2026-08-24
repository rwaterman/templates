#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"

if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir/cdk"
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/etc/ssl/cert.pem}"

npx cdk destroy "ecs-alb-cdk-${environment}" \
  --context "environment=${environment}" \
  --force
