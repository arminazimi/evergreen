from conan import ConanFile


class ZeroConan(ConanFile):
    name = "zero"
    version = "2.0.0"
    settings = "os", "compiler", "build_type", "arch"

    def requirements(self):
        self.requires("boost/1.86.0")
        self.requires("fmt/11.0.2")
