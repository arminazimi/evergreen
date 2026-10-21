resource "aws_lambda_function" "api" {
  function_name = "api"
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  role          = "arn:aws:iam::123456789012:role/api"
}

resource "azurerm_linux_function_app" "api" {
  name = "api"

  site_config {
    application_stack {
      node_version = "22"
    }
  }
}

resource "google_cloudfunctions2_function" "worker" {
  name     = "worker"
  location = "us-central1"

  build_config {
    runtime     = "python313"
    entry_point = "worker"
  }
}
