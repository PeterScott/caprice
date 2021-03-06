(function() {
  var ctree, db, patch_poller_process, process_uuid, randrange, redis, redislib, util, write_uuid;
  redislib = require('redis');
  redis = redislib.createClient();
  util = require('util');
  ctree = require('./ctree');
  db = require('./db');
  randrange = function(low, high) {
    return low + Math.floor(Math.random() * (high - low + 1));
  };
  patch_poller_process = function() {
    return redis.spop('pending-set', function(err, uuid) {
      if (err) {
        console.log("Redis error:", util.inspect(err));
        return setTimeout(patch_poller_process, randrange(700, 1300));
      } else if (uuid === null) {
        return setTimeout(patch_poller_process, randrange(700, 1300));
      } else {
        return process_uuid(uuid.toString(), function() {
          return setTimeout(patch_poller_process, randrange(0, 100));
        });
      }
    });
  };
  process_uuid = function(uuid, callback) {
    return db.get_weave(uuid, function(err, weave5c, patches) {
      var _i, _len, _ref, patch;
      if (err) {
        return console.log("Error:", util.inspect(err));
      } else {
        console.log("Applying " + (patches.length) + " patches to weave " + (uuid));
        _ref = patches;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          patch = _ref[_i];
          try {
            if (patch[0] === 'i') {
              weave5c = apply_insert_patch(weave5c(patch[1], patch[2]));
            } else if (patch[0] === 'd') {
              weave5c = apply_delete_patch(weave5c(patch[1]));
            } else if (patch[0] === 's') {
              weave5c = apply_save_edits_patch(weave5c(patch[1]));
            } else {
              console.log("Error: invalid patch:", util.inspect(patch));
            }
          } catch (error) {
            console.log("Error:", util.inspect(error));
          }
        }
        return write_uuid(uuid, weave5c, patches.length, callback);
      }
    });
  };
  write_uuid = function(uuid, weave5c, applied_patches, callback) {
    var multi;
    multi = redis.multi();
    multi.set(uuid + ':weave5c', weave5c);
    multi.ltrim(uuid + ':patches', applied_patches, -1);
    multi.llen(uuid + ':patches');
    return multi.exec(function(err, replies) {
      var remaining_patches;
      if (err) {
        console.log("Redis error:", util.inspect(err));
        return callback();
      } else {
        remaining_patches = parseInt(replies[2].toString(), 10);
        if (remaining_patches > 0) {
          console.log("Adding " + (uuid) + " back to pending set");
          return redis.sadd('pending-set', uuid, function(err) {
            if (err) {
              console.log("Redis error:", util.inspect(err));
            }
            return callback();
          });
        } else {
          return callback();
        }
      }
    });
  };
  setTimeout(patch_poller_process, randrange(0, 100));
}).call(this);
