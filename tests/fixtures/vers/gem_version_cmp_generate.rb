require "rubygems"
require "json"
srand(7)
parts = %w[0 1 2 3 10 11 0 5 20]
suffix = ["", "", "", ".a", ".b", ".rc1", ".pre", ".beta2", "-1", "-rc", ".0", ".0.0", ".alpha.1", ".dev"]
versions = []
400.times do
  n = 1 + rand(4)
  v = Array.new(n) { parts.sample }.join(".") + suffix.sample
  versions << v if Gem::Version.correct?(v) && !versions.include?(v)
end
pairs = []
versions.each_slice(2) { |a, b| pairs << [a, b] if b }
versions.sample(200).each_cons(2) { |a, b| pairs << [a, b] }
out = pairs.map { |a, b| [a, b, Gem::Version.new(a) <=> Gem::Version.new(b)] }
puts JSON.generate(out)
