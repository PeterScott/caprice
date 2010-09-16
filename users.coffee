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

redis_check_error = (e) ->
  if e then throw new Error(e)

# A simple set data type, for Client objects with username properties.
class ClientSet
  # Create an empty set
  constructor: ->
    @items = {}
    @size = 0

  # Add an item to the set, destructively.
  add: (x) ->
    @size++ unless @has x
    @items[x.username] = x
    return this

  # Remove an item from the set, destructively.
  remove: (x) ->
    delete @items[x.username]
    @size--
    return this

  # Does the set contain a given item?
  has: (x) ->
    return @items.hasOwnProperty x.username

  # Is the set empty?
  empty: ->
    return @size == 0

#############################
# Tracking who's in what room
#############################

# Dict mapping room names with people to sets of client objects.
rooms = {}
# FIXME: add function to load rooms data from Redis. IMPORTANT!

# Add a client to a room, both in Redis and to the rooms object, and
# return the username:client mapping.
add_to_room = (client, room, callback) ->
  redis_txn [["set", "chat:uname:#{client.username}", client.sessionId],
             ["set",  "chat:sid:#{sessionId}", client.username],
             ["sadd", "chat:r:#{room}:clientIds", client.sessionId],
             ["sadd", "chat:r:#{room}:clientNames", client.username],
             ["sadd", "chat:#{client.username}:rooms", room]], (e) ->
    redis_check_error e
    console.log "Client #{client.username} (#{client.sessionId}) added to room #{room}"
    rooms[room] = new ClientSet() unless rooms.hasOwnProperty room
    rooms[room].add client
    callback rooms[room].items

# Remove a client from a room, both in Redis and to the rooms object,
# and return the username:client mapping.
remove_from_room = (client, room, callback) ->
  r.smembers "chat:#{client.username}:rooms", (e, data) ->
    txn = [["del", "chat:uname:#{client.username}"],
           ["del", "chat:sid:#{client.sessionId}"],
           ["del", "chat:#{client.username}:rooms"]]
    for room in data
      txn.push ["srem", "chat:r:#{room}:clientIds", client.sessionId]
      txn.push ["srem", "chat:r:#{room}:clientNames", client.username]
    redis_txn txn, (e) ->
      redis_check_error e
      console.log "Client #{client.username} (#{client.sessionId}) disconnected."
      if rooms.hasOwnProperty room
        rooms[room].remove client
        if rooms[room].empty() then delete rooms[room]
      callback (if rooms.hasOwnProperty room then rooms[room] else {})