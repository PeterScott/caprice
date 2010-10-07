# Chat server
http     = require 'http'
path     = require 'path'
pubsub   = require 'pubsubcore'
paperboy = require 'paperboy'

# Serve static files out of ./chat/
WEBROOT = path.join(path.dirname(__filename), 'chat')
server = http.createServer (request, response) ->
  paperboy.deliver(webroot)

# Attach pubsubcore to the HTTP server.
pubsub.listen(server)

# Add a handler for messages addressed to any channel
pubsub.add_handler /.*/, (client, msg) ->
  console.log "MSG:", sys.inspect(msg)
  # Treat the channel name as the room name.
  pubsub.broadcast_room msg.channel, {
    name: msg.name,
    text: msg.text
  }

# Start the server
server.listen 8124
console.log 'Server running at http://127.0.0.1:8124/'