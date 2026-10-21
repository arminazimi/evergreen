import asyncio

asyncio.set_child_watcher(watcher)  # reported: call of asyncio.set_child_watcher
asyncio.get_child_watcher()  # reported: call of asyncio.get_child_watcher
asyncio.new_event_loop()  # not reported: another asyncio function
