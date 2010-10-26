(function() {
  var WEB_ROOT, db, http, paperboy, path, pubsub, server, sys;
  http = require('http');
  path = require('path');
  pubsub = require('pubsubcore');
  paperboy = require('paperboy');
  db = require('./db');
  sys = require('sys');
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
  pubsub.add_handler('/req/create_weave_if_not_exist', function(client, msg) {
    var uuid;
    uuid = msg.data.uuid;
    if (!(typeof uuid !== "undefined" && uuid !== null)) {
      client.send({
        error: 'No UUID given.'
      });
      return null;
    }
    return db.weave_exists(uuid, function(exists) {
      return exists ? client.send({
        room: '/rep/create_weave_if_not_exist',
        data: null
      }) : db.create_weave_with_uuid(uuid, function(err) {
        return err ? client.send({
          error: ("Database error: " + (err))
        }) : client.send({
          room: '/rep/create_weave_if_not_exist',
          data: null
        });
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
  pubsub.add_handler('/req/get_yarn', function(client, msg) {
    var username, uuid;
    username = msg.data.username;
    if (!(typeof username !== "undefined" && username !== null)) {
      client.send({
        error: 'No username specified'
      });
      return null;
    }
    uuid = msg.data.uuid;
    if (!(typeof uuid !== "undefined" && uuid !== null)) {
      client.send({
        error: 'No UUID given.'
      });
      return null;
    }
    return db.get_yarn(uuid, username, function(err, yarn) {
      return err ? client.send({
        error: ("Database error: " + (err))
      }) : client.send({
        room: '/rep/get_yarn',
        data: yarn
      });
    });
  });
  pubsub.add_handler(/^\/weave\/.*/, function(client, msg) {
    var uuid;
    console.log(sys.inspect(msg));
    uuid = msg.channel.substr(7);
    return db.weave_exists(uuid, function(exists) {
      return (!exists) ? client.send({
        error: 'No weave exists with UUID ' + uuid
      }) : db.add_patch(uuid, msg.data, function(err) {
        return err ? client.send({
          error: err
        }) : pubsub.broadcast_room(msg.channel, {
          room: msg.channel,
          data: msg.data
        });
      });
    });
  });
  server.listen(8124);
  console.log('Server running at http://127.0.0.1:8124/');
})();
