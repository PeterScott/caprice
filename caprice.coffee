# Caprice server for Node.js, in CoffeeScript. Uses Redis as a
# backend, and Socket.IO for communication with the browser.

http  = require 'http'
url   = require 'url'
fs    = require 'fs'
sys   = require 'sys'
path  = require 'path'
io    = require '/Users/pjscott/web/socket.io-node'
users = require './users'

server = http.createServer (request, response) ->
  pathname = (url.parse request.url).pathname
  switch pathname
    when '/'
      response.writeHead 200, {'Content-Type': 'text/html'}
      response.end "<p>Caprice server</p>"
    when '/index.html'
      writeFile response, pathname, "text/html"
    when '/style.css'
      writeFile response, pathname, "text/css"
    when '/app.js'
      writeFile response, pathname, "text/javascript"
    else
      response.writeHead 404, {"Content-Type": "text/plain"}
      response.end "404 not found"

writeFile = (response, pathname, mimetype) ->
  filename = path.join process.cwd(), pathname
  path.exists filename, (exists) ->
    if !exists
      response.writeHead 404, {"Content-Type": "text/plain"}
      response.end "404 not found, but it should be there.\n"
    else
      fs.readFile filename, "binary", (err, file) ->
        if err
          response.writeHead 500, {"Content-Type": "text/plain"}
          response.end err + '\n'
        else
          response.writeHead 200, {"Content-Type": mimetype}
          response.write file, "binary"
          response.end()

socket = io.listen(server)
socket.on 'connection', (client) ->
  client.on 'message', (msg) ->
    console.log msg
    if msg.connect?
      client.username = msg.connect.name
      # Add user info to Redis
      users.add_to_room client, msg.connect.room, (clients) ->
        # Broadcast new-user notification
        for sig, c of clients
          c.send {
            announcement: true,
            name: client.username,
            action: 'connected'
          }
    else
      other.send msg for other in users.room_clients msg.room
  client.on 'disconnect', ->
    # Remove user from Redis.
    users.remove_from_all_rooms client, (clients) ->
        # Broadcast the disconnect announcement to everyone else.
        for sid, c of clients
          c.send {
            announcement: true,
            name: client.username || "anonymous",
            action: 'disconnected'
          }

# Start the server
server.listen 8124
console.log 'Server running at http://127.0.0.1:8124/'