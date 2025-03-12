#!/bin/bash

# Usage: STACK_NAME=foobar-api ./script.sh <stack-name>
: "${STACK_NAME:?Variable not set or empty}"

# Set environment variables
WAIT_TIME=30  # Time in seconds to wait between status checks
MAX_ATTEMPTS=6  # Maximum number of attempts before giving up

# Get all DMS replication tasks that match the given prefix
TASKS=$(aws dms describe-replication-tasks --query "ReplicationTasks[?starts_with(ReplicationTaskIdentifier, \`${STACK_NAME}\`)].ReplicationTaskIdentifier" --output text)

if [ -z "$TASKS" ]; then
  echo "No DMS tasks found for stack: $STACK_NAME"
else
  # Function to check the status of a task
  check_task_status() {
    TASK_ARN=$1
    aws dms describe-replication-tasks --filters "Name=replication-task-arn,Values=$TASK_ARN" --query "ReplicationTasks[0].Status" --output text
  }

  # Function to stop a single task and wait for it to be stopped, with a maximum of MAX_ATTEMPTS
  stop_and_wait_task() {
    TASK_ID=$1
    TASK_ARN=$(aws dms describe-replication-tasks --filters "Name=replication-task-id,Values=$TASK_ID" --query "ReplicationTasks[0].ReplicationTaskArn" --output text)

    STATUS=$(check_task_status $TASK_ARN)

    if [ "$STATUS" == "running" ]; then
      echo "Sending stop signal to DMS task: $TASK_ID"
      aws dms stop-replication-task --replication-task-arn $TASK_ARN

      # Wait for the task to stop, with a maximum of MAX_ATTEMPTS
      ATTEMPTS=0
      while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
        STATUS=$(check_task_status $TASK_ARN)

        if [ "$STATUS" == "stopped" ]; then
          echo "Task $TASK_ID is fully stopped."
          return 0
        elif [ "$STATUS" == "failed" ]; then
          echo "Task $TASK_ID failed to stop."
          return 1
        fi

        # Increment attempt counter and wait
        ATTEMPTS=$((ATTEMPTS + 1))

        if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
          echo "Max attempts reached for task $TASK_ID. Giving up."
          return 1
        fi

        echo "Waiting for task $TASK_ID to stop... (Attempt $ATTEMPTS of $MAX_ATTEMPTS)"
        sleep $WAIT_TIME
      done
    else
      echo "Task $TASK_ID is not running (current status: $STATUS). Skipping stop operation."
    fi
  }

  # Send stop signal to all tasks in parallel
  for TASK in $TASKS; do
    stop_and_wait_task $TASK &
  done

  # Wait for all tasks to finish
  wait

  echo "Task stop process complete."
fi

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
