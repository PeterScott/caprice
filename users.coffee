sets = require 'simplesets'

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
  rooms[room] = new sets.Set() unless rooms.hasOwnProperty room
  rooms[room].add client
  callback rooms[room].array()

# Remove a client from all rooms, both in Redis and to the rooms object,
# and return the username:client mapping for everybody in those rooms.
exports.remove_from_all_rooms = (client, callback) ->
  affected_clients = new sets.Set()
  for room in (sid_rooms[client.sessionId]?.array() or [])
    if rooms.hasOwnProperty room
      rooms[room].remove client
      if rooms[room].size() === 0 then delete rooms[room]
    if rooms.hasOwnProperty room
      for cli in rooms[room].array()
        affected_clients.add cli
  console.log "Client #{client.username} (#{client.sessionId}) disconnected."
  delete sid_rooms[client.sessionId]
  callback affected_clients.array()

# Return list of clients in the current room.
exports.room_clients = (room) ->
  rooms[room]?.array() or []