# engine_version = "12.22"
resource "aws_db_instance" "orders" {
  identifier        = "orders"
  engine            = var.db_engine
  engine_version    = var.db_engine_version
  instance_class    = "db.t3.micro"
  allocated_storage = 20
}

resource "aws_db_instance" "reports" {
  identifier     = "reports"
  engine         = "postgres"
  engine_version = "${local.pg_major}.22"
  instance_class = "db.t3.micro"
}

resource "aws_db_parameter_group" "orders" {
  name        = "orders-pg"
  family      = "postgres12"
  description = "engine_version 12.22 for the orders database"
}

resource "aws_instance" "bastion" {
  ami = "ami-0123456789abcdef0"
  tags = {
    engine_version = "12.22"
  }
}
