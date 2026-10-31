resource "google_cloudfunctions_function" "handler" {
  name    = "handler"
  runtime = "java11"
}
