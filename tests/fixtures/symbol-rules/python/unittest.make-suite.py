import unittest

unittest.makeSuite(Case)  # reported: call of unittest.makeSuite
unittest.findTestCases(module)  # reported: call of unittest.findTestCases
unittest.getTestCaseNames(Case)  # reported: call of unittest.getTestCaseNames
unittest.defaultTestLoader.loadTestsFromTestCase(Case)  # not reported: the replacement
unittest.TestLoader().getTestCaseNames(Case)  # not reported: the method form
