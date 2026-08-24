output "load_balancer_url" {
  value = "http://${aws_lb.main.dns_name}"
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.app.name
}

output "autoscaling_group_name" {
  value = aws_autoscaling_group.ecs.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

