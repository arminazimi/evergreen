resource "google_cloudfunctions_function" "handler" {
  name    = "handler"
  runtime = "dotnet6"
}
