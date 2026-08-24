#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
region="${AWS_REGION:-us-west-2}"

if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir/cdk"
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/etc/ssl/cert.pem}"

npm ci
npm run build
npx cdk deploy "ecs-alb-cdk-${environment}" \
  --context "environment=${environment}" \
  --require-approval never

aws cloudformation describe-stacks \
  --region "$region" \
  --stack-name "ecs-alb-cdk-${environment}" \
  --query 'Stacks[0].Outputs' \
  --output table
