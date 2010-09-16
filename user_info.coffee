r = (require './redis-client').createClient()

# Redis helper function. Runs a list of Redis commands as a
# transaction with EXEC/MULTI. If any error is encountered while
# queueing commands, the callback is called with that error.
redis_txn = (commands, callback) ->
  run_commands = (cmds) ->
    if cmds.length > 0
      cmd = cmds.shift()
      cmd.push (e) ->
        if e then callback e else run_commands cmds
      r.sendCommand.apply r, cmd
    else
      r.exec callback
  r.multi (e) ->
    if e then callback e else run_commands commands

# A simple set data type. It stores keys in an object. It doesn't
# support operations like intersection or union, but it has some basic
# set functionality. NOTE: all modification operations change the set
# in-place, rather than returning a new set as is commonly done in
# more functional languages. Also, because of how JavaScript does
# things, it should only be used to store sets of strings.
class Set
  # Takes an optional list of items to add to the set.
  constructor: (initial_items) ->
    @items = {}
    @size = 0
    if initial_items? then @add x for x in initial_items

  # Add an item to the set, destructively.
  add: (x) ->
    @size++ unless @has x
    @items[x] = true
    return this

  # Remove an item from the set, destructively.
  remove: (x) ->
    delete @items[x]
    @size--
    return this

  # Does the set contain a given item?
  has: (x) ->
    return @items.hasOwnProperty x

  # Is the set empty?
  empty: ->
    return @size == 0

  # Return a list of the items
  list: ->
    ret = []
    ret.push name for name, val of @items
    ret

# A set backed by a Redis set. This assumes that no other processes
# will modify the data in Redis, so it does not treat the data as
# volatile and will only read the data from Redis when the set is
# initialized. This is useful for creating servers that can be easily
# restarted without data loss.
class RedisSet extends Set
  # Initialize with the name of the Redis key.
  constructor: (@key, callback) ->
    super()
    self = this
    r.smembers @key, (e, items) ->
      if items? then Set.prototype.add.call(self, x.toString()) for x in items
      callback()

  add: (x, callback) ->
    super
    r.sadd @key, x, callback

  remove: (x, callback) ->
    super
    r.srem @key, x, callback

ss = new RedisSet "ss_set", ->
  console.log ss.list()
#ss.add "foo"
#ss.add "bar"
#ss.add "baz"
#ss.add "foo"
