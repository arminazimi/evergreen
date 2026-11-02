import unittest
from unittest import TestCase


class Example(TestCase):
    def test_aliases(self):
        self.assertEquals(actual, expected)  # reported: assertEquals
        self.assertNotEquals(actual, expected)  # reported: assertNotEquals
        self.assert_(flag)  # reported: assert_
        self.failUnless(flag)  # reported: failUnless
        self.failIf(flag)  # reported: failIf
        self.failUnlessEqual(actual, expected)  # reported: failUnlessEqual
        self.failIfEqual(actual, expected)  # reported: failIfEqual
        self.assertAlmostEquals(actual, expected)  # reported: assertAlmostEquals
        self.assertNotAlmostEquals(actual, expected)  # reported: assertNotAlmostEquals
        self.failUnlessAlmostEqual(actual, expected)  # reported: failUnlessAlmostEqual
        self.failIfAlmostEqual(actual, expected)  # reported: failIfAlmostEqual
        self.failUnlessRaises(ValueError, int, "x")  # reported: failUnlessRaises
        self.assertRegexpMatches(text, pattern)  # reported: assertRegexpMatches
        self.assertNotRegexpMatches(text, pattern)  # reported: assertNotRegexpMatches
        self.assertRaisesRegexp(ValueError, "x", int, "x")  # reported: assertRaisesRegexp
        self.assertDictContainsSubset({"a": 1}, actual)  # reported: assertDictContainsSubset
        self.assertEqual(actual, expected)  # not reported: the current method
        helper.assertEquals(actual, expected)  # reported: any receiver inside a TestCase


class Plain:
    def check(self):
        self.assertEquals(actual, expected)  # not reported: outside a TestCase
        self.failUnless(flag)  # not reported: outside a TestCase
