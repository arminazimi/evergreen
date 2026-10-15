# VERS test vectors

These JSON files are copied unchanged from the official VERS specification test suite:
https://github.com/package-url/vers-spec/tree/main/tests

They are used by `tests/vers*.test.ts` to check Evergreen's VERS implementation against the specification.

Copyright (c) the purl authors. Licensed under the MIT License (SPDX-License-Identifier: MIT):
https://github.com/package-url/vers-spec/blob/main/LICENSE

## RubyGems vectors

`gem_version_cmp_test.json` is not part of the VERS suite. It holds version pairs and the sign of `Gem::Version#<=>` from RubyGems 3.0.3.1, produced by `gem_version_cmp_generate.rb`, so the `gem` comparator can be tested against the real implementation without Ruby installed.
