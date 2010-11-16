# Daemon that runs in the background, applying patches to weaves on
# the Redis server. Do not instantiate more than one of this server.

# FIXME: this does not actually work yet. Use the Python daemon instead.

redislib = require 'redis'
redis    = redislib.createClient()
util     = require 'util'
ctree    = require './ctree'
db       = require './db'

randrange = (low, high) ->
  low + Math.floor(Math.random() * (high - low + 1))

# Poll for patches in the pending set, and apply patches.
patch_poller_process = () ->
  redis.spop 'pending-set', (err, uuid) ->
    if err
      console.log "Redis error:", util.inspect err
      # Delay: 1 second +/- 300 ms.
      setTimeout patch_poller_process, randrange(700, 1300)
    else if uuid is null
      # Delay: 1 second +/- 300 ms.
      setTimeout patch_poller_process, randrange(700, 1300)
    else
      process_uuid uuid.toString(), ->
        # Delay: 50 ms +/- 50 ms
        setTimeout patch_poller_process, randrange(0, 100)

# FIXME: add orphan scavenger and shinigami

# Apply patches to a weave with a given UUID.
process_uuid = (uuid, callback) ->
  db.get_weave uuid, (err, weave5c, patches) ->
    if err
      console.log "Error:", util.inspect err
    else
      console.log "Applying #{patches.length} patches to weave #{uuid}"
      for patch in patches
        try
          if patch[0] is 'i'
            weave5c = apply_insert_patch weave5c patch[1], patch[2]
          else if patch[0] is 'd'
            weave5c = apply_delete_patch weave5c patch[1]
          else if patch[0] is 's'
            weave5c = apply_save_edits_patch weave5c patch[1]
          else
            console.log "Error: invalid patch:", util.inspect patch
        catch error
          console.log "Error:", util.inspect error
      write_uuid uuid, weave5c, patches.length, callback

# Write back changes to a weave. Changes the weave5c, and removes the
# given number of patches from the patch list. If there are still
# patches pending, the uuid will be added back to the pending set.
write_uuid = (uuid, weave5c, applied_patches, callback) ->
  multi = redis.multi()
  multi.set uuid + ':weave5c', weave5c
  multi.ltrim uuid + ':patches', applied_patches, -1
  multi.llen uuid + ':patches'
  multi.exec (err, replies) ->
    if err
      console.log "Redis error:", util.inspect err
      callback()
    else
      remaining_patches = parseInt(replies[2].toString(), 10)
      if remaining_patches > 0
        console.log "Adding #{uuid} back to pending set"
        redis.sadd 'pending-set', uuid, (err) ->
          if err then console.log "Redis error:", util.inspect err
          callback()
      else
        callback()

setTimeout patch_poller_process, randrange(0, 100)
