module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "20.0.0"
  cluster_version = "1.28"
}
