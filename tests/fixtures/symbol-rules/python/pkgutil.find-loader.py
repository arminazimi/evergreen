import pkgutil
import importlib.util

pkgutil.find_loader("json")  # reported: call of pkgutil.find_loader
pkgutil.get_loader("json")  # reported: call of pkgutil.get_loader
importlib.util.find_spec("json")  # not reported: the replacement
pkgutil.iter_modules()  # not reported: another pkgutil function
