variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "image_uri" {
  description = "ECR image URI including a tag. The deploy script builds and supplies this value."
  type        = string
  default     = "bootstrap.invalid/app:latest"
}

variable "instance_type" {
  description = "ECS container instance type."
  type        = string
  default     = "t3.small"
}

