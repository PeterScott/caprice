## r = (require './redis-client').createClient()
##
## # Redis helper function. Runs a list of Redis commands as a
## # transaction with EXEC/MULTI. If any error is encountered while
## # queueing commands, the callback is called with that error.
## redis_txn = (commands, callback) ->
##   run_commands = (cmds) ->
##     if cmds.length > 0
##       cmd = cmds.shift()
##       cmd.push (e) ->
##         if e then callback e else run_commands cmds
##       r.sendCommand.apply r, cmd
##     else
##       r.exec callback
##   r.multi (e) ->
##     if e then callback e else run_commands commands
##
## redis_check_error = (e) ->
##   if e then throw new Error(e)

#############################
# Set data types
#############################

# A simple set data type, for string objects
class StringSet
  # Create an empty set
  constructor: ->
    @items = {}
    @size = 0

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
# Dict mapping usernames to sets of rooms.
user_rooms = {}

# Add a client to a room, both in Redis and to the rooms object, and
# return the username:client mapping.
exports.add_to_room = (client, room, callback) ->
  console.log "Client #{client.username} (#{client.sessionId}) added to room #{room}"
  user_rooms[client.username] = new StringSet() unless user_rooms.hasOwnProperty client.username
  user_rooms[client.username].add room
  rooms[room] = new ClientSet() unless rooms.hasOwnProperty room
  rooms[room].add client
  callback rooms[room].items

# Remove a client from all rooms, both in Redis and to the rooms object,
# and return the username:client mapping for everybody in those rooms.
exports.remove_from_all_rooms = (client, callback) ->
  affected_users = new ClientSet()
  for room, t of (user_rooms[client.username]?.items or {})
    if rooms.hasOwnProperty room
      rooms[room].remove client
      if rooms[room].empty() then delete rooms[room]
    if rooms.hasOwnProperty room
      for name, cli of rooms[room].items
        affected_users.add cli
  console.log "Client #{client.username} (#{client.sessionId}) disconnected."
  delete user_rooms[client.username]
  callback affected_users.items

exports.room_clients = (room) ->
  ret = []
  ret.push client for name, client of (rooms[room].items or {})
  return ret