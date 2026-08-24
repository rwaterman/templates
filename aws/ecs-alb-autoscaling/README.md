# ECS + ALB autoscaling on Amazon Linux 2023

This template deploys the same Node.js application two ways:

- AWS CDK (TypeScript)
- Terraform

Each implementation creates isolated `dev` and `prod` environments with:

- A two-AZ VPC using public subnets and no NAT Gateway
- An internet-facing Application Load Balancer
- An ECS cluster backed by EC2 Auto Scaling
- ECS-optimized Amazon Linux 2023 container instances
- A Node.js container based on Amazon Linux 2023
- ECS service scaling on CPU and ALB requests per target
- ECS capacity-provider managed scaling for the EC2 Auto Scaling group
- CloudWatch logs and container insights

`dev` starts with one task and one EC2 instance. `prod` starts with two tasks and two instances. Both can scale out under load.

## Prerequisites

- AWS CLI credentials with permissions for VPC, EC2, ECS, ECR, ELBv2, IAM, CloudWatch, Auto Scaling, SSM, and CloudFormation
- Node.js 22+
- Docker with `buildx`
- AWS CDK v2 (installed locally by npm)
- Terraform 1.8+
- `curl`

The default region is `us-west-2`. Override it with `AWS_REGION`.

## Application

The service exposes:

- `GET /health` — ALB and container health check
- `GET /` — returns environment and task hostname
- `GET /work?ms=200` — performs bounded CPU work for scaling tests

Run its test locally:

```bash
cd app
npm test
```

## CDK

Deploy an environment:

```bash
./scripts/deploy-cdk.sh dev
./scripts/deploy-cdk.sh prod
```

Read the stack outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name ecs-alb-cdk-dev \
  --query 'Stacks[0].Outputs'
```

Destroy both environments:

```bash
./scripts/destroy-cdk.sh prod
./scripts/destroy-cdk.sh dev
```

CDK uses the account's existing `CDKToolkit` asset repository. Destroying these application stacks removes their runtime infrastructure; CDK's shared bootstrap stack is intentionally not managed by this repository.

## Terraform

The deploy script first creates ECR with Terraform, builds and pushes the application image, and then applies the complete stack.

```bash
./scripts/deploy-terraform.sh dev
./scripts/deploy-terraform.sh prod
```

State is kept in local Terraform workspaces named `dev` and `prod` for this self-contained example. A team deployment should configure a versioned S3 backend with DynamoDB locking.

Destroy both environments:

```bash
./scripts/destroy-terraform.sh prod
./scripts/destroy-terraform.sh dev
```

The ECR repositories use `force_delete`, so their test images are removed during destroy.

## Verify and load-test scaling

Use the URL, cluster name, and service name from the deployment outputs:

```bash
./scripts/verify-service.sh http://example-alb.us-west-2.elb.amazonaws.com

./scripts/load-test-scaling.sh \
  http://example-alb.us-west-2.elb.amazonaws.com \
  ecs-alb-cdk-dev \
  ecs-alb-cdk-dev-ServiceABC123 \
  360 \
  24
```

The load test continuously calls the CPU-heavy endpoint and fails unless the ECS desired task count increases before the test window ends. Scaling metrics use one-minute CloudWatch periods, so allow at least five to six minutes.

## Cost and cleanup

These examples create billable ALBs, EC2 instances, ECR storage, and CloudWatch logs. Deploy only while testing and always run the matching destroy scripts. Confirm cleanup with:

```bash
aws cloudformation describe-stacks --stack-name ecs-alb-cdk-dev
aws cloudformation describe-stacks --stack-name ecs-alb-cdk-prod
aws ecs list-clusters
aws elbv2 describe-load-balancers
aws ecr describe-repositories
```
