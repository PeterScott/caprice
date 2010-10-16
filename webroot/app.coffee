#pubsub = new PubSubCore()

$ ->
  json_print_msg = (msg) ->
    console.log JSON.stringify msg

  pubsub.default_handler = json_print_msg
  pubsub.onerror         = json_print_msg

  pubsub.join_room 'Peter', 'room-uuid'
  pubsub.connect()