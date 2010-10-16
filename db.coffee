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

# Return true if patch is valid, false otherwise.
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
#
# FIXME: check to make sure that all atoms in the patch5c have the
# same user_id, and that it corresponds to the user.
exports.add_patch = (uuid, patch, callback) ->
  # Validate patch. If it's invalid, error.
  unless patch_valid(patch)
    callback('Invalid patch: ' + sys.inspect(patch))
  else
    # Add patch, and mark this weave for patching
    txn = redis.multi()
    txn.rpush(uuid + ':patches', JSON.stringify(patch))
    txn.sadd('pending-set', uuid)
    txn.exec (err) ->
      callback err