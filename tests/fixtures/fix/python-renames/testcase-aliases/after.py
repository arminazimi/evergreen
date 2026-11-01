import unittest
from unittest import TestCase


class Example(TestCase):
    def test_aliases(self):
        self.assertEqual(actual, expected)
        self.assertNotEqual(actual, expected)
        self.assertTrue(flag)
        self.assertTrue(flag)
        self.assertFalse(flag)
        self.assertEqual(actual, expected)
        self.assertNotEqual(actual, expected)
        self.assertAlmostEqual(actual, expected)
        self.assertNotAlmostEqual(actual, expected)
        self.assertAlmostEqual(actual, expected)
        self.assertNotAlmostEqual(actual, expected)
        self.assertRaises(ValueError, int, "x")
        self.assertRegex(text, pattern)
        self.assertNotRegex(text, pattern)
        self.assertRaisesRegex(ValueError, "x", int, "x")
        self.assertEqual(actual, expected)
        helper.assertEqual(actual, expected)


class Inherited(unittest.TestCase):
    def test_one(self):
        self.assertTrue(flag)
