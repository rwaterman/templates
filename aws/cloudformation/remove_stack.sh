#!/bin/bash

# Usage: STACK_NAME=foobar-api ./script.sh <stack-name>
: "${STACK_NAME:?Variable not set or empty}"

# Find All S3 Buckets with the Naming Pattern of <stack-name>-*
BUCKETS=$(aws s3api list-buckets --query "Buckets[?starts_with(Name, \`${STACK_NAME}-\`)].Name" --output text)

for BUCKET in $BUCKETS; do

    echo "Emptying bucket $BUCKET"

    # Empty the S3 Bucket
    aws s3 rm "s3://$BUCKET" --recursive
done

echo "Deleting CloudFormation stack $STACK_NAME"

# Delete the CloudFormation Stack
aws cloudformation delete-stack --stack-name "$STACK_NAME"

echo "Script completed."
