redislib = require 'redis'
redis    = redislib.createClient()
libuuid  = require 'uuid'
sys      = require 'sys'

# Does a weave with given UUID exist? Calls callback.
exports.weave_exists = (uuid, callback) ->
  redis.exists uuid + ':weave5c', (err, exists_num) ->
    callback (if err then false else exists_num > 0)

# Call callback(err, weave5c, patches).
exports.get_weave = (uuid, callback) ->
  chain = redis.multi()
  chain.get(uuid + ':weave5c')
  chain.lrange(uuid + ':patches', 0, -1)
  chain.exec (err, replies) ->
    if err
      callback(err, null, null)
    else if !(replies[0])
      callback("weave does not exist", null, null);
    else
      [weave5c_buf, patches_buf] = replies
      weave5c = weave5c_buf.toString('utf-8')
      patches = JSON.parse p.toString('ascii') for p in patches_buf when p
      callback(null, weave5c, patches)

# Create a new, empty weave and call callback(err, uuid).
exports.create_weave = (callback) ->
  uuid = libuuid.generate()
  redis.set uuid + ':weave5c', '\u09500101\u06DD0102', (err) ->
    callback err, uuid