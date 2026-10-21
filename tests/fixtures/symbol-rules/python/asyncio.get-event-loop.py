import asyncio

loop = asyncio.get_event_loop()  # reported: call of asyncio.get_event_loop
asyncio.run(main())  # not reported: the replacement
asyncio.get_running_loop()  # not reported: the replacement inside coroutines
registry = {"get_event_loop": 1}  # not reported: a string key
