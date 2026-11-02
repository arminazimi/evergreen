from unittest import TestCase


class Example(TestCase):
    def test_mixed(self):
        self.assertDictContainsSubset({"a": 1}, actual)
        self.assertEquals(actual, expected)
