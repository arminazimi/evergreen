import shutil

shutil.rmtree("build", onerror=handle)  # reported: onerror option of shutil.rmtree
shutil.rmtree("build", onexc=handle)  # not reported: the replacement
shutil.rmtree("build")  # not reported: no handler
shutil.copytree("a", "b", onerror=handle)  # not reported: another function
