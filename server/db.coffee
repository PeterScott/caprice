redislib = require 'redis'
redis    = redislib.createClient()
libuuid  = require 'uuid'
util     = require 'util'

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
  timestamp = (new Date()).valueOf() # ms since epoch
  multi = redis.multi()
  multi.zadd 'empty-weaves', timestamp, uuid
  multi.set uuid + ':weave5c', '\u09500101\u06DD0102'
  multi.exec (err) ->
    callback err, uuid

# Create a new, empty weave with the given UUID and call
# callback(err). If the given weave already exists, it will be
# overwritten. This is dangerous! If you expose this function to
# clients, make sure to check to make sure they're not deleting data
# without permission.
exports.create_weave_with_uuid = (uuid, callback) ->
  timestamp = (new Date()).valueOf() # ms since epoch
  multi = redis.multi()
  multi.set uuid + ':weave5c', '\u09500101\u06DD0102'
  multi.del uuid + ':patches', uuid + ':yarn-offset', uuid + ':yarns'
  multi.zadd 'empty-weaves', timestamp, uuid
  multi.exec (err) ->
    callback err

# Return true if patch is valid, false otherwise.
#
# FIXME: The server should check to make sure that the patch refers
# to predecessor nodes which are under the current awareness weft.
#
# FIXME: check to make sure that all atoms in the patch5c have the
# same user_id, and that it corresponds to the user.
patch_valid = (patch) ->
  # Patches must be lists; here, we check object type and length
  if typeof(patch) != 'object' then return false
  if patch.length == undefined then return false
  # A patch5c must have length divisible by 5
  if patch[1].length % 5 != 0 then return false
  # A weft2 must have length divisible by 2
  if patch[2] and patch[2].length % 2 != 0 then return false
  # The patch types have different acceptable numbers of fields.
  if patch[0] == 'i' and (patch.length == 2 or patch.length == 3) then return true
  if patch[0] == 'd' and patch.length == 2 then return true
  if patch[0] == 's' and patch.length == 2 then return true
  # If none of the valid types matched, default to invalid.
  return false

# Add a patch to a weave, and call callback(err). Assumes that the
# weave exists.
exports.add_patch = (uuid, patch, callback) ->
  # Validate patch. If it's invalid, error.
  unless patch_valid(patch)
    callback('Invalid patch: ' + util.inspect(patch))
  else
    # Add patch, and mark this weave for patching
    txn = redis.multi()
    txn.rpush(uuid + ':patches', JSON.stringify(patch))
    txn.sadd('pending-set', uuid)
    txn.zrem('empty-weaves', uuid)
    txn.exec (err) ->
      callback err

# Get the yarn for this user in this weave. Currently only handles a
# single yarn character, so this imposes a limit on the size of a
# weave. This is stored in the database as a per-weave hash, mapping
# usernames to yarns. It is called '[uuid]:yarns'. There is an offset
# counter called '[uuid]:yarn-offset'.
exports.get_yarn = (uuid, username, callback) ->
  exports.weave_exists uuid, (exists) ->
    unless exists
      callback "Weave does not exist", null
    else
      redis.hget uuid+':yarns', username, (err, yarn) ->
        if err
          callback(err, null)
        else if !yarn           # No yarn yet; make a new one
          redis.incr uuid+':yarn-offset', (err, offset) ->
            if err
              callback(err, null)
            else
              yarn = String.fromCharCode('a'.charCodeAt(0) + offset - 1)
              console.log('Made new yarn: ', yarn);
              redis.hset(uuid+':yarns', username, yarn);
              callback(null, yarn);
        else
          callback(null, yarn.toString('utf-8'))