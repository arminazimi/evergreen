import typing

use(typing.no_type_check_decorator)  # reported: reference to typing.no_type_check_decorator
# typing.no_type_check_decorator(arg)  # not reported: a comment
note = "typing.no_type_check_decorator"  # not reported: a string
typing.other(arg)  # not reported: another member
