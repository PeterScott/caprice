(function() {
  var WEB_ROOT, db, http, paperboy, path, pubsub, server;
  http = require('http');
  path = require('path');
  pubsub = require('pubsubcore');
  paperboy = require('paperboy');
  db = require('./db');
  WEB_ROOT = path.join(path.dirname(__filename), 'webroot');
  server = http.createServer(function(request, response) {
    return paperboy.deliver(WEB_ROOT, request, response);
  });
  pubsub.listen(server);
  pubsub.add_handler('/req/helo', function(client, msg) {
    console.log("HELO from " + (client.sessionId));
    return client.send({
      room: '/rep/helo',
      data: {
        server_type: 'Caprice',
        version: '1.0'
      }
    });
  });
  pubsub.add_handler('/req/weave_status', function(client, msg) {
    var uuid;
    uuid = msg.data.uuid;
    if (!(typeof uuid !== "undefined" && uuid !== null)) {
      client.send({
        error: 'No UUID given.'
      });
      return null;
    }
    return db.get_weave(uuid, function(err, weave5c, patches) {
      return err ? client.send({
        error: ("Database error: " + (err))
      }) : client.send({
        room: '/rep/weave_status',
        data: {
          uuid: uuid,
          weave5c: weave5c,
          patches: patches
        }
      });
    });
  });
  pubsub.add_handler('/req/create_weave', function(client, msg) {
    return db.create_weave(function(err, uuid) {
      return err ? client.send({
        error: ("Database error: " + (err))
      }) : client.send({
        room: '/rep/create_weave',
        data: {
          uuid: uuid
        }
      });
    });
  });
  pubsub.add_handler(/^\/weave\/ins\/.*/, function(client, msg) {
    return console.log(sys.inspect(msg));
  });
  server.listen(8124);
  console.log('Server running at http://127.0.0.1:8124/');
})();
