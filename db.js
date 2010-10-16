(function() {
  var libuuid, redis, redislib, sys;
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
})();
