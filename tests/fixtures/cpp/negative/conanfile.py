from conan import ConanFile


class NegativeConan(ConanFile):
    name = "negative"
    # requires = "zlib/1.2.13"
    description = "mentions requires and zlib/1.2.13 but declares nothing"
    build_requires = "cmake/3.27.9"

    def requirements(self):
        self.requires(self.settings.get_safe("optional_package"))

    def build_requirements(self):
        self.tool_requires("ninja/1.11.1")

    def generate(self):
        self.output.info("requires zlib/1.2.13")
