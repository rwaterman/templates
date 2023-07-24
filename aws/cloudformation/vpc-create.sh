#!/bin/bash

: "${STACK_NAME:?Variable not set or empty}"

aws cloudformation create-stack \
  --stack-name "$STACK_NAME" \
  --template-body file://vpc.yml \
  --parameters file://vpc.parameters.json
