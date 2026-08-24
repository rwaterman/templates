#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { EcsAlbStack } from "../lib/ecs-alb-stack";

const app = new cdk.App();
const environment = app.node.tryGetContext("environment") ?? process.env.APP_ENV ?? "dev";

if (!["dev", "prod"].includes(environment)) {
  throw new Error(`environment must be dev or prod, received: ${environment}`);
}

new EcsAlbStack(app, `ecs-alb-cdk-${environment}`, {
  environment,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-west-2"
  },
  description: `ECS EC2 AL2023 Node.js service with ALB autoscaling (${environment})`
});

