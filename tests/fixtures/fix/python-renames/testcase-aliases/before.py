import unittest
from unittest import TestCase


class Example(TestCase):
    def test_aliases(self):
        self.assertEquals(actual, expected)
        self.assertNotEquals(actual, expected)
        self.assert_(flag)
        self.failUnless(flag)
        self.failIf(flag)
        self.failUnlessEqual(actual, expected)
        self.failIfEqual(actual, expected)
        self.assertAlmostEquals(actual, expected)
        self.assertNotAlmostEquals(actual, expected)
        self.failUnlessAlmostEqual(actual, expected)
        self.failIfAlmostEqual(actual, expected)
        self.failUnlessRaises(ValueError, int, "x")
        self.assertRegexpMatches(text, pattern)
        self.assertNotRegexpMatches(text, pattern)
        self.assertRaisesRegexp(ValueError, "x", int, "x")
        self.assertEqual(actual, expected)
        helper.assertEquals(actual, expected)


class Inherited(unittest.TestCase):
    def test_one(self):
        self.failUnless(flag)
