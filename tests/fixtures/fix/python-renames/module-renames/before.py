import configparser
import io

from configparser import SafeConfigParser
from io import OpenWrapper

qualified_parser = configparser.SafeConfigParser()
parser = SafeConfigParser()
wrapper = io.OpenWrapper
builtin = OpenWrapper
factory = configparser.SafeConfigParser
