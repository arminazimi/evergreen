resource "aws_lambda_function" "api" {
  function_name = "api"
  runtime       = "nodejs14.x"
  handler       = "index.handler"
  role          = "arn:aws:iam::123456789012:role/api"
}

resource "azurerm_linux_function_app" "api" {
  name = "api"

  site_config {
    application_stack {
      node_version = "14"
    }
  }
}

resource "azurerm_windows_function_app" "worker" {
  name = "worker"

  site_config {
    application_stack {
      dotnet_version = "3.1"
    }
  }
}

resource "google_cloudfunctions_function" "api" {
  name    = "api"
  runtime = "nodejs14"
}

resource "google_cloudfunctions2_function" "worker" {
  name     = "worker"
  location = "us-central1"

  build_config {
    runtime     = "python38"
    entry_point = "worker"
  }
}
