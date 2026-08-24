import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface EcsAlbStackProps extends cdk.StackProps {
  readonly environment: "dev" | "prod";
}

export class EcsAlbStack extends cdk.Stack {
  public readonly loadBalancerDnsName: string;

  constructor(scope: Construct, id: string, props: EcsAlbStackProps) {
    super(scope, id, props);

    const isProd = props.environment === "prod";
    const desiredTasks = isProd ? 2 : 1;
    const maxTasks = isProd ? 10 : 6;
    const minInstances = isProd ? 2 : 1;
    const maxInstances = isProd ? 6 : 4;

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        }
      ]
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `ecs-alb-cdk-${props.environment}`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED
    });

    const instanceSecurityGroup = new ec2.SecurityGroup(this, "InstanceSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "ECS container instances"
    });

    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, "EcsAsg", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType("t3.small"),
      machineImage: ecs.EcsOptimizedImage.amazonLinux2023(),
      minCapacity: minInstances,
      maxCapacity: maxInstances,
      securityGroup: instanceSecurityGroup,
      requireImdsv2: true,
      newInstancesProtectedFromScaleIn: false
    });

    autoScalingGroup.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const capacityProvider = new ecs.AsgCapacityProvider(this, "CapacityProvider", {
      autoScalingGroup,
      enableManagedScaling: true,
      enableManagedTerminationProtection: false,
      targetCapacityPercent: 80,
      minimumScalingStepSize: 1,
      maximumScalingStepSize: 2
    });
    cluster.addAsgCapacityProvider(capacityProvider);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, "TaskDefinition", {
      networkMode: ecs.NetworkMode.BRIDGE
    });

    const container = taskDefinition.addContainer("App", {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../../app"), {
        platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64
      }),
      cpu: 512,
      memoryReservationMiB: 384,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `ecs-alb-cdk-${props.environment}`
      }),
      environment: {
        APP_ENV: props.environment,
        PORT: "3000"
      },
      healthCheck: {
        command: ["CMD-SHELL", "node -e \"fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(20)
      }
    });
    container.addPortMappings({
      containerPort: 3000,
      hostPort: 0,
      protocol: ecs.Protocol.TCP
    });

    const service = new ecs.Ec2Service(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: desiredTasks,
      capacityProviderStrategies: [
        {
          capacityProvider: capacityProvider.capacityProviderName,
          weight: 1
        }
      ],
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      enableECSManagedTags: true,
      circuitBreaker: { rollback: true }
    });

    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, "LoadBalancerSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Public HTTP access to the ALB"
    });
    loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    instanceSecurityGroup.addIngressRule(
      loadBalancerSecurityGroup,
      ec2.Port.tcpRange(32768, 65535),
      "ALB to dynamic ECS host ports"
    );

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true,
      securityGroup: loadBalancerSecurityGroup
    });
    const listener = loadBalancer.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP
    });
    const targetGroup = listener.addTargets("EcsTargets", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(20),
      healthCheck: {
        path: "/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(20),
        timeout: cdk.Duration.seconds(5)
      }
    });

    const scalableTarget = service.autoScaleTaskCount({
      minCapacity: desiredTasks,
      maxCapacity: maxTasks
    });
    scalableTarget.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 35,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(30)
    });
    scalableTarget.scaleOnRequestCount("RequestScaling", {
      requestsPerTarget: 100,
      targetGroup,
      scaleInCooldown: cdk.Duration.seconds(120),
      scaleOutCooldown: cdk.Duration.seconds(30)
    });

    cdk.Tags.of(this).add("Project", "ecs-alb-autoscaling-iac");
    cdk.Tags.of(this).add("Environment", props.environment);
    cdk.Tags.of(this).add("ManagedBy", "CDK");

    this.loadBalancerDnsName = loadBalancer.loadBalancerDnsName;
    new cdk.CfnOutput(this, "LoadBalancerUrl", {
      value: `http://${this.loadBalancerDnsName}`,
      exportName: `ecs-alb-cdk-${props.environment}-url`
    });
    new cdk.CfnOutput(this, "ClusterName", {
      value: cluster.clusterName
    });
    new cdk.CfnOutput(this, "ServiceName", {
      value: service.serviceName
    });
    new cdk.CfnOutput(this, "AutoScalingGroupName", {
      value: autoScalingGroup.autoScalingGroupName
    });
  }
}
