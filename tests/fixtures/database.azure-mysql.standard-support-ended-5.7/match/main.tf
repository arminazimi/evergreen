resource "azurerm_mysql_flexible_server" "db" {
  name                = "example"
  resource_group_name = "example"
  location            = "westeurope"
  version             = "5.7"
}
