(function() {
  $(function() {
    var json_print_msg;
    json_print_msg = function(msg) {
      return console.log(JSON.stringify(msg));
    };
    pubsub.default_handler = json_print_msg;
    pubsub.onerror = json_print_msg;
    pubsub.join_room('Peter', 'room-uuid');
    return pubsub.connect();
  });
})();
