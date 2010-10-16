# Caprice server
http     = require 'http'
path     = require 'path'
pubsub   = require 'pubsubcore'
paperboy = require 'paperboy'
db       = require './db'
sys      = require 'sys'


# Serve static files out of ./webroot/
WEB_ROOT = path.join(path.dirname(__filename), 'webroot')
server = http.createServer (request, response) ->
  paperboy.deliver(WEB_ROOT, request, response)

# Attach pubsubcore to the HTTP server.
pubsub.listen(server)

# When a message comes in on /req/helo, send back a reply on
# /rep/helo. This pattern is followed for all req/rep services.
pubsub.add_handler '/req/helo', (client, msg) ->
  console.log "HELO from #{client.sessionId}"
  client.send {room: '/rep/helo', data: {server_type: 'Caprice', version: '1.0'}}

# A request with data {uuid: "..."} comes in, and we reply with the
# weave5c and patch list of the weave.
pubsub.add_handler '/req/weave_status', (client, msg) ->
  uuid = msg.data.uuid
  unless uuid?
    client.send {error: 'No UUID given.'}
    return
  db.get_weave uuid, (err, weave5c, patches) ->
    if err
      client.send {error: "Database error: #{err}"}
    else
      client.send {
        room: '/rep/weave_status',
        data: {uuid: uuid, weave5c: weave5c, patches: patches}
      }

# For debugging use, or if you don't care about security.
pubsub.add_handler '/req/create_weave', (client, msg) ->
  db.create_weave (err, uuid) ->
    if err
      client.send {error: "Database error: #{err}"}
    else
      client.send {
        room: '/rep/create_weave',
        data: {uuid: uuid}
      }

# Receive patches. These come in one of three forms:
#
# ['i', insertion_patch5c, <weft>], where weft is optional
# ['d', deletion_patch5c]
# ['s', save_edits_patch5c]
#
# The patch, if valid, will be stored in Redis and then broadcast to
# the room /weave/<uuid>.
pubsub.add_handler /^\/weave\/.*/, (client, msg) ->
  uuid = msg.channel.substr(7)  # Strip off "/weave/"
  db.weave_exists uuid, (exists) ->
    if (!exists)
      client.send {error: 'No weave exists with UUID ' + uuid}
    else
      db.add_patch uuid, msg.data, (err) ->
        if err
          client.send {error: err}
        else
          pubsub.broadcast_room msg.channel, {
            room: msg.channel,
            data: msg.data
          }

# Start the server
server.listen 8124
console.log 'Server running at http://127.0.0.1:8124/'