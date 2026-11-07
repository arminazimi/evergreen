resource "google_sql_database_instance" "db" {
  name             = "example"
  database_version = "MYSQL_5_7"
  region           = "europe-west1"
}
