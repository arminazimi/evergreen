resource "aws_db_instance" "orders" {
  identifier        = "orders"
  engine            = "postgres"
  engine_version    = "12.22"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
}
