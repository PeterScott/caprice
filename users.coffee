sets = require 'simplesets'

#############################
# Set data types
#############################

# A simple set data type, for Client objects
class ClientSet
  # Create an empty set
  constructor: ->
    @items = {}
    @size = 0

  # Add an item to the set, destructively.
  add: (x) ->
    @size++ unless @has x
    @items[x.sessionId] = x
    return this

  # Remove an item from the set, destructively.
  remove: (x) ->
    delete @items[x.sessionId]
    @size--
    return this

  # Does the set contain a given item?
  has: (x) ->
    return @items.hasOwnProperty x.sessionId

  # Is the set empty?
  empty: ->
    return @size == 0

#############################
# Tracking who's in what room
#############################

# Dict mapping room names with people to sets of client objects.
rooms = {}
# Dict mapping sids to sets of rooms.
sid_rooms = {}

# Add a client to a room, both in Redis and to the rooms object, and
# return the sid:client mapping.
exports.add_to_room = (client, room, callback) ->
  console.log "Client #{client.username} (#{client.sessionId}) added to room #{room}"
  sid_rooms[client.sessionId] = new sets.Set() unless sid_rooms.hasOwnProperty client.sessionId
  sid_rooms[client.sessionId].add room
  rooms[room] = new ClientSet() unless rooms.hasOwnProperty room
  rooms[room].add client
  callback rooms[room].items

# Remove a client from all rooms, both in Redis and to the rooms object,
# and return the username:client mapping for everybody in those rooms.
exports.remove_from_all_rooms = (client, callback) ->
  affected_clients = new ClientSet()
  for room in (sid_rooms[client.sessionId]?.array() or [])
    if rooms.hasOwnProperty room
      rooms[room].remove client
      if rooms[room].empty() then delete rooms[room]
    if rooms.hasOwnProperty room
      for sid, cli of rooms[room].items
        affected_clients.add cli
  console.log "Client #{client.username} (#{client.sessionId}) disconnected."
  delete sid_rooms[client.sessionId]
  callback affected_clients.items

exports.room_clients = (room) ->
  ret = []
  ret.push client for name, client of (rooms[room].items or {})
  return ret