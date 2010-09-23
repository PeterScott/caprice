# Caprice server for Node.js, in CoffeeScript. Uses Redis as a
# backend, and Socket.IO for communication with the browser.

http   = require 'http'
url    = require 'url'
fs     = require 'fs'
sys    = require 'sys'
path   = require 'path'
pubsub = require './pubsubcore'

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
    when '/pubsubcore-client.js'
      writeFile response, pathname, "text/javascript"
    when '/app2.js'
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

pubsub.listen(server)
pubsub.add_handler /.*/, (client, msg) ->
  console.log "MSG:", sys.inspect(msg)
  msg.room = msg.channel
  delete msg.channel
  pubsub.broadcast_room msg.room, msg

# Start the server
server.listen 8124
console.log 'Server running at http://127.0.0.1:8124/'