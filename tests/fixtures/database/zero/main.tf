resource "aws_db_instance" "orders" {
  identifier        = "orders"
  engine            = "postgres"
  engine_version    = "17.4"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
}

resource "aws_db_instance" "catalog" {
  identifier        = "catalog"
  engine            = "mysql"
  engine_version    = "8.4.3"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
}
