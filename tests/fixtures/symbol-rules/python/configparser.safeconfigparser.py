import configparser

configparser.SafeConfigParser(arg)  # reported: call of configparser.SafeConfigParser
# configparser.SafeConfigParser(arg)  # not reported: a comment
note = "configparser.SafeConfigParser"  # not reported: a string
configparser.other(arg)  # not reported: another member
