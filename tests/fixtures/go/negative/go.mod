module example.com/go/1.99.0

// go 1.99.0
// toolchain go1.99.0
// require example.com/commented v9.9.9

replace example.com/original v1.0.0 => example.com/replacement v2.0.0
exclude example.com/excluded v3.0.0

go ${GO_VERSION}
toolchain go${TOOLCHAIN_VERSION}
require example.com/dynamic ${MODULE_VERSION}
require example.com/indirect v4.0.0 // indirect

