#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"

if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
terraform_dir="$root_dir/terraform"
var_file="envs/${environment}.tfvars"

terraform -chdir="$terraform_dir" init
if ! terraform -chdir="$terraform_dir" workspace select "$environment"; then
  echo "No workspace exists for ${environment}; nothing to destroy."
  exit 0
fi

terraform -chdir="$terraform_dir" destroy \
  -var-file="$var_file" \
  -auto-approve

terraform -chdir="$terraform_dir" workspace select default
terraform -chdir="$terraform_dir" workspace delete "$environment"
