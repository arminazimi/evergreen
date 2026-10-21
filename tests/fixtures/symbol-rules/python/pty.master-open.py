import pty

pty.master_open()  # reported: call of pty.master_open
pty.slave_open("/dev/pts/0")  # reported: call of pty.slave_open
pty.openpty()  # not reported: the replacement
