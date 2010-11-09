# Caprice server
http     = require 'http'
path     = require 'path'
pubsub   = require 'pubsubcore'
paperboy = require 'paperboy'
db       = require './db'
sys      = require 'sys'
libuuid  = require 'uuid'
urlparse = (require 'url').parse


# Serve static files out of ./webroot/
WEB_ROOT = path.join(path.dirname(__filename), 'webroot')
server = http.createServer (req, res) ->
  # Take a look at the request string
  parts = urlparse req.url
  lcase_url = parts.pathname.toLowerCase()

  # Redirect to /notepad/[uuid] from '/' and '/notepad', optionally
  # with a trailing slash.
  if (req.method == 'GET' and parts.pathname.match(/\/(notepad\/?)?$/))
    uuid = libuuid.generate().toLowerCase()
    res.writeHead 302, 'Redirecting to new notepad', {
      'Location': '/notepad/' + uuid,
      'Content-Type': 'text/html'
    }
    res.end '<h1>Redirecting to new notepad</h1>\n'
  # If request is for /notepad/[uuid], serve index.html?uuid=[uuid]
  else if (req.method == 'GET' and lcase_url.match(/\/notepad\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/?$/))
    uuid = lcase_url.substring(9)
    req.url = '/index.html?uuid=' + uuid
    paperboy.deliver(WEB_ROOT, req, res)
  else
    paperboy.deliver(WEB_ROOT, req, res)

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
    client.send {error: 'w-s: No UUID given.'}
    return
  db.get_weave uuid, (err, weave5c, patches) ->
    if err
      client.send {error: "Database error: #{err}"}
    else
      client.send {
        room: '/rep/weave_status',
        data: {uuid: uuid, weave5c: weave5c, patches: patches}
      }

# Creates a weave with the given uuid if it does not exist.
pubsub.add_handler '/req/create_weave_if_not_exist', (client, msg) ->
  uuid = msg.data.uuid
  unless uuid?
    client.send {error: 'c-w-i-n-e: No UUID given.'}
    return
  db.weave_exists uuid, (exists) ->
    if exists
      client.send {
        room: '/rep/create_weave_if_not_exist',
        data: null
      }
    else
      db.create_weave_with_uuid uuid, (err) ->
        if err
          client.send {error: "Database error: #{err}"}
        else
          client.send {
            room: '/rep/create_weave_if_not_exist',
            data: null
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

# A client finds out its yarn by sending a request to this channel,
# where data specifies `uuid` and `username`. The data send on the rep
# channel is a string containing the one character.
pubsub.add_handler '/req/get_yarn', (client, msg) ->
  username = msg.data.username
  unless username?
    client.send {error: 'No username specified'}
    return
  uuid = msg.data.uuid
  unless uuid?
    client.send {error: 'g-y: No UUID given.'}
    return

  db.get_yarn uuid, username, (err, yarn) ->
    if err
      client.send {error: "Database error: #{err}"}
    else
      client.send {
        room: '/rep/get_yarn',
        data: yarn
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
#  console.log(sys.inspect(msg))
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

# Req/rep for finding out who else is in the room. Send a {uuid: uuid}
# message to the req channel, and it will respond with a list of the
# usernames of the people in the given weave, or null if there are no
# people there or the weave does not exist.
pubsub.add_handler '/req/get_users', (client, msg) ->
  uuid = msg.data.uuid
  unless uuid?
    client.send {error: 'g-u: No UUID given.'}
    return
  client.send {
    room: '/rep/get_users',
    data: pubsub.users_in_room '/weave/' + uuid
  }

# Start the server on the port specified by argv[0], or 8124 by default.
port = parseInt(process.argv[0] || '8124', 10);
server.listen port
console.log "Server running on port #{port}"