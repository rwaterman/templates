#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
region="${AWS_REGION:-us-west-2}"

if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stack_name="ecs-alb-cdk-${environment}"
cd "$root_dir/cdk"
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/etc/ssl/cert.pem}"

if npx cdk destroy "$stack_name" --context "environment=${environment}" --force; then
  exit 0
fi

status="$(aws cloudformation describe-stacks \
  --region "$region" \
  --stack-name "$stack_name" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo MISSING)"

if [[ "$status" != "DELETE_FAILED" ]]; then
  exit 1
fi

# CloudFormation deletes the ECS service without waiting for it to drain, so removing the
# capacity provider association can fail with ResourceInUse. Retry once draining finishes.
for attempt in 1 2 3 4 5; do
  echo "Stack ${stack_name} is DELETE_FAILED; retrying deletion (attempt ${attempt})." >&2
  aws cloudformation delete-stack --region "$region" --stack-name "$stack_name"
  if aws cloudformation wait stack-delete-complete --region "$region" --stack-name "$stack_name"; then
    exit 0
  fi
  sleep 30
done

echo "Stack ${stack_name} could not be deleted; inspect its events." >&2
exit 1
