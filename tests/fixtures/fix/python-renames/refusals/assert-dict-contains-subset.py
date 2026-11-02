from unittest import TestCase


class Example(TestCase):
    def test_subset(self):
        self.assertDictContainsSubset({"a": 1}, actual)
