(function() {
  var libuuid, patch_valid, redis, redislib, sys;
  redislib = require('redis');
  redis = redislib.createClient();
  libuuid = require('uuid');
  sys = require('sys');
  exports.weave_exists = function(uuid, callback) {
    return redis.exists(uuid + ':weave5c', function(err, exists_num) {
      return callback(err ? false : exists_num > 0);
    });
  };
  exports.get_weave = function(uuid, callback) {
    var chain;
    chain = redis.multi();
    chain.get(uuid + ':weave5c');
    chain.lrange(uuid + ':patches', 0, -1);
    return chain.exec(function(err, replies) {
      var _a, _b, _c, _d, _e, p, patches, patches_buf, weave5c, weave5c_buf;
      if (err) {
        return callback(err, null, null);
      } else if (!(replies[0])) {
        return callback("weave does not exist", null, null);
      } else {
        _a = replies;
        weave5c_buf = _a[0];
        patches_buf = _a[1];
        weave5c = weave5c_buf.toString('utf-8');
        patches = (function() {
          _b = []; _d = patches_buf;
          for (_c = 0, _e = _d.length; _c < _e; _c++) {
            p = _d[_c];
            if (p) {
              _b.push(JSON.parse(p.toString('ascii')));
            }
          }
          return _b;
        })();
        return callback(null, weave5c, patches);
      }
    });
  };
  exports.create_weave = function(callback) {
    var uuid;
    uuid = libuuid.generate();
    return redis.set(uuid + ':weave5c', '\u09500101\u06DD0102', function(err) {
      return callback(err, uuid);
    });
  };
  patch_valid = function(patch) {
    if (typeof (patch) !== 'object') {
      return false;
    }
    if (patch.length === undefined) {
      return false;
    }
    if (patch[1].length % 5 !== 0) {
      return false;
    }
    if (patch[2] && patch[2].length % 2 !== 0) {
      return false;
    }
    if (patch[0] === 'i' && (patch.length === 2 || patch.length === 3)) {
      return true;
    }
    if (patch[0] === 'd' && patch.length === 2) {
      return true;
    }
    if (patch[0] === 's' && patch.length === 2) {
      return true;
    }
    return false;
  };
  exports.add_patch = function(uuid, patch, callback) {
    var txn;
    if (!(patch_valid(patch))) {
      return callback('Invalid patch: ' + sys.inspect(patch));
    } else {
      txn = redis.multi();
      txn.rpush(uuid + ':patches', JSON.stringify(patch));
      txn.sadd('pending-set', uuid);
      return txn.exec(function(err) {
        return callback(err);
      });
    }
  };
  exports.get_yarn = function(uuid, username, callback) {
    return exports.weave_exists(uuid, function(exists) {
      return !(exists) ? callback("Weave does not exist", null) : redis.hget(uuid + ':yarns', username, function(err, yarn) {
        if (err) {
          return callback(err, null);
        } else if (!yarn) {
          return redis.incr(uuid + ':yarn-offset', function(err, offset) {
            if (err) {
              return callback(err, null);
            } else {
              yarn = String.fromCharCode('a'.charCodeAt(0) + offset - 1);
              console.log('Made new yarn: ', yarn);
              redis.hset(uuid + ':yarns', username, yarn);
              return callback(null, yarn);
            }
          });
        } else {
          return callback(null, yarn.toString('utf-8'));
        }
      });
    });
  };
})();
