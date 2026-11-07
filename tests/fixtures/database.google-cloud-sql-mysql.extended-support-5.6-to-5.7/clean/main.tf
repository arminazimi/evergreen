resource "google_sql_database_instance" "db" {
  name             = "example"
  database_version = "MYSQL_8_0"
  region           = "europe-west1"
}
