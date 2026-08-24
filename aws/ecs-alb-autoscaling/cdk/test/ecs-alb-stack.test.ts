import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { EcsAlbStack } from "../lib/ecs-alb-stack";

test("creates an AL2023 ECS capacity provider, ALB, and scalable service", () => {
  const app = new cdk.App({
    context: {
      "@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig": true
    }
  });
  const stack = new EcsAlbStack(app, "TestStack", {
    environment: "dev"
  });
  const template = Template.fromStack(stack);

  template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 1);
  template.resourceCountIs("AWS::ECS::Service", 1);
  template.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 1);
  template.resourceCountIs("AWS::AutoScaling::LaunchConfiguration", 0);
  template.hasResourceProperties("AWS::EC2::LaunchTemplate", {
    LaunchTemplateData: Match.objectLike({
      InstanceType: "t3.small",
      MetadataOptions: { HttpTokens: "required" }
    })
  });
  template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
    HealthCheckPath: "/health"
  });
  template.hasResourceProperties("AWS::ECS::TaskDefinition", {
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Environment: Match.arrayWith([
          { Name: "APP_ENV", Value: "dev" }
        ])
      })
    ])
  });
  assert.ok(stack.loadBalancerDnsName);
});

