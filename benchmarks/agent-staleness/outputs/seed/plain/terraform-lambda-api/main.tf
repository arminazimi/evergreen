resource "aws_lambda_function" "api" {
  function_name = "api"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs14.x"
  filename      = "api.zip"
}
