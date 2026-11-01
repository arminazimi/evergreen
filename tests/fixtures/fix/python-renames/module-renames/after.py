import configparser
import io

from configparser import ConfigParser
from io import open

qualified_parser = configparser.ConfigParser()
parser = ConfigParser()
wrapper = io.open
builtin = open
factory = configparser.ConfigParser
