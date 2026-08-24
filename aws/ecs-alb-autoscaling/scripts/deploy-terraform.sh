#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
region="${AWS_REGION:-us-west-2}"

if [[ "$environment" != "dev" && "$environment" != "prod" ]]; then
  echo "Usage: $0 <dev|prod>" >&2
  exit 1
fi

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
terraform_dir="$root_dir/terraform"
var_file="envs/${environment}.tfvars"
image_tag="$(git -C "$root_dir" rev-parse --short HEAD 2>/dev/null || echo latest)"

terraform -chdir="$terraform_dir" init
terraform -chdir="$terraform_dir" workspace select -or-create "$environment"

# Provision ECR first so the application image exists before ECS starts tasks.
terraform -chdir="$terraform_dir" apply \
  -var-file="$var_file" \
  -target=aws_ecr_repository.app \
  -auto-approve

repository_url="$(terraform -chdir="$terraform_dir" output -raw ecr_repository_url)"
registry="${repository_url%%/*}"
image_uri="${repository_url}:${image_tag}"

aws ecr get-login-password --region "$region" |
  docker login --username AWS --password-stdin "$registry"
docker buildx build \
  --platform linux/amd64 \
  --push \
  --tag "$image_uri" \
  "$root_dir/app"

terraform -chdir="$terraform_dir" apply \
  -var-file="$var_file" \
  -var="image_uri=$image_uri" \
  -auto-approve

terraform -chdir="$terraform_dir" output
