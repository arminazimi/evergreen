resource "aws_db_instance" "orders" {
  engine         = "postgres"
  engine_version = "10.23"
  instance_class = "db.t3.micro"
}
