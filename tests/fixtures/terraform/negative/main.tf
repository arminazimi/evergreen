# terraform {
#   required_version = "~> 0.12.31"
# }

variable "terraform_version" {
  type    = string
  default = "0.12.31"
}

terraform {
  required_version = var.terraform_version

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = local.aws_provider_version
    }
  }
}

module "network" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "3.0.0"
}

resource "aws_eks_cluster" "main" {
  name     = "main"
  version  = "1.13"
  role_arn = "arn:aws:iam::123456789012:role/eks"
}

locals {
  note = "required_version = 0.12.31"
}
