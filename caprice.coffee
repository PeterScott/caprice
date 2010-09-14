# Caprice server for Node.js, in CoffeeScript. Uses Redis as a
# backend, and Socket.IO for communication with the browser.

require.paths.unshift '.'
http  = require 'http'
url   = require 'url'
fs    = require 'fs'
sys   = require 'sys'
path  = require 'path'
io    = require '/Users/pjscott/web/socket.io-node'
redis = require 'redis-client'

r = redis.createClient()

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

# Redis helper function
redis_txn = (commands, callback) ->
  run_commands = (cmds) ->
    if cmds.length > 0
      cmd = cmds.shift()
      cmd.push((e) -> run_commands cmds)
      r.sendCommand.apply r, cmd
    else
      r.exec callback
  r.multi (e) ->
    run_commands commands

# FIXME: put all chat room state in Redis!
#
# Redis keys:
#   chat:r:[roomname]:clientIds   --  set of session ids in room
#   chat:r:[roomname]:clientNames --  set of usernames in room
#   chat:uname:[username]         --  session id of username
#   chat:sid:[session-id]         --  username of session id
#   chat:[username]:rooms         --  rooms that user is in

socket = io.listen(server)
socket.on 'connection', (client) ->
  client.on 'message', (msg) ->
    console.log msg
    if msg.connect?
      client.username = msg.connect.name
      # Add user info to Redis
      redis_txn [["set", "chat:uname:#{client.username}", client.sessionId],
                 ["set",  "chat:sid:#{client.sessionId}", client.username],
                 ["sadd", "chat:r:#{msg.connect.room}:clientIds", client.sessionId],
                 ["sadd", "chat:r:#{msg.connect.room}:clientNames", client.username],
                 ["sadd", "chat:#{client.username}:rooms", msg.connect.room]], (e) ->
        console.log "Client #{client.username} (#{client.sessionId}) added to room #{msg.connect.room}"
    else
      client.broadcast msg
  client.on 'disconnect', ->
    # Remove user from Redis.
    r.smembers "chat:#{client.username}:rooms", (e, data) ->
      console.log data.toString()
      txn = [["del", "chat:uname:#{client.username}"],
             ["del", "chat:sid:#{client.sessionId}"],
             ["del", "chat:#{client.username}:rooms"]]
      for room in data
        txn.push ["srem", "chat:r:#{room}:clientIds", client.sessionId]
        txn.push ["srem", "chat:r:#{room}:clientNames", client.username]
      redis_txn txn, (e) ->
        # Broadcast the disconnect announcement to everyone else.
        console.log "Client #{client.username} (#{client.sessionId}) disconnected."
        client.broadcast {
          announcement: true,
          name: client.username || "anonymous",
          action: 'disconnected'
        }

# Start the server
server.listen 8124
console.log 'Server running at http://127.0.0.1:8124/'