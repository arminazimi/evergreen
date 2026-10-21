import http.server

use(http.server.CGIHTTPRequestHandler)  # reported: reference to http.server.CGIHTTPRequestHandler
# http.server.CGIHTTPRequestHandler(arg)  # not reported: a comment
note = "http.server.CGIHTTPRequestHandler"  # not reported: a string
http.server.other(arg)  # not reported: another member
