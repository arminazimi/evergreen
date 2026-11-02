import configparser
import io
import unittest


class Example(unittest.TestCase):
    def test_value(self):
        self.assertEquals(actual, expected)
        self.failUnless(flag)


parser = configparser.SafeConfigParser()
stream = io.OpenWrapper(path)
