from conan import ConanFile


class PositiveConan(ConanFile):
    name = "positive"
    version = "1.4.0"
    settings = "os", "compiler", "build_type", "arch"
    requires = "zlib/1.2.13", "openssl/1.1.1t"

    def requirements(self):
        self.requires("boost/1.75.0")

    def build_requirements(self):
        self.tool_requires("cmake/3.27.9")
