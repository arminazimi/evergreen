# spec.required_ruby_version = ">= 3.1.0"
Gem::Specification.new do |spec|
  spec.name = "negative"
  spec.version = "0.1.0"
  spec.summary = "prose mentions required_ruby_version = \">= 2.7\" only"
  spec.add_dependency "rack", "2.2.8"
  spec.add_development_dependency "rspec", "3.12.0"
  spec.required_ruby_version = ENV["REQUIRED_RUBY_VERSION"]
  spec.metadata["source_code_uri"] = "https://example.com/required_ruby_version"
end
