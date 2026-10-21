# runtime = "nodejs14.x"

resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"
}

resource "aws_lambda_function" "api" {
  function_name = "api"
  runtime       = var.lambda_runtime
  handler       = "index.handler"
  role          = "arn:aws:iam::123456789012:role/api"
  description   = "runtime nodejs14.x"
}

resource "aws_lambda_function" "image" {
  function_name = "image"
  package_type  = "Image"
  image_uri     = "public.ecr.aws/lambda/nodejs:14"
  role          = "arn:aws:iam::123456789012:role/image"
}

resource "azurerm_linux_function_app" "api" {
  name = "api"

  site_config {
    application_stack {
      node_version = var.node_version
    }
  }
}

resource "azurerm_function_app" "legacy" {
  name = "legacy"

  site_config {
    linux_fx_version = "NODE|14"
  }
}

resource "google_cloudfunctions_function" "api" {
  name    = "api"
  runtime = local.function_runtime
}

data "aws_lambda_function" "existing" {
  function_name = "existing"
}

resource "aws_lambda_function" "nested" {
  runtime = var.r
  environment {
    variables = {
      runtime = "nodejs14.x"
    }
  }
  tags = {
    runtime = "python3.8"
  }
}

resource "azurerm_linux_function_app" "labels" {
  name = "labels"

  site_config {
    always_on = true
  }

  app_settings = {
    node_version = "14"
  }
}
