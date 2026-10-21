import io

use(io.OpenWrapper)  # reported: reference to io.OpenWrapper
# io.OpenWrapper(arg)  # not reported: a comment
note = "io.OpenWrapper"  # not reported: a string
io.other(arg)  # not reported: another member
