#!/bin/bash

aws cloudformation create-stack \
  --stack-name fm-vpc-dev \
  --region "$AWS_REGION" \
  --template-body file://vpc.yml \
  --parameters file://vpc.parameters.json
