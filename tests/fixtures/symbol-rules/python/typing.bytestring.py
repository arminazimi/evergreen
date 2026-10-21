import typing

use(typing.ByteString)  # reported: reference to typing.ByteString
# typing.ByteString(arg)  # not reported: a comment
note = "typing.ByteString"  # not reported: a string
typing.other(arg)  # not reported: another member
