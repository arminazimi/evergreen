resource "aws_db_instance" "orders" {
  engine         = "postgres"
  engine_version = "11.22"
  instance_class = "db.t3.micro"
}
