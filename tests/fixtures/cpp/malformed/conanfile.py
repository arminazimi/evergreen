from conan import ConanFile


class MalformedConan(ConanFile):
    requires = "zlib/1.3.1

    def requirements(self):
        self.requires("fmt/11.0.2"
