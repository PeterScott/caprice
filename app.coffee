#
# Chatting code here
#

username = null
chatroom = null
pubsub   = new PubSubCore()

press_signin_button = (e) ->
  $("#signin-button").click() if e.keyCode == 13

show_message = (name, text) ->
  $('#chatwindow').append "<p><b>#{name}:</b> #{text}</p>"

$ ->
  $("#username").keypress press_signin_button
  $("#chatroom").keypress press_signin_button

  $("#signin-button").click ->
    username = $("#username").val()
    chatroom = $("#chatroom").val().replace(/\//g, '')
    if username.length == 0 or chatroom.length == 0
      alert "You must enter a username and chatroom"
    else
      pubsub.join_room username, chatroom;
      pubsub.add_handler chatroom, chat_handler
      $("#signin").hide()
      $("#chat").show()

  $("#chatline").keypress (e) ->
    if e.keyCode == 13
      text = $("#chatline").val()
      pubsub.send(chatroom, {name: username, text: text});
      $("#chatline").val ''

chat_handler = (msg) ->
  show_message msg.name, msg.text

pubsub.onannounce = (msg) ->
  $('#chatwindow').append "<p><i>#{msg.name} #{msg.action}</i></p>"

#
# Connection code
#

pubsub.onconnect = ->
  $("#log").append "<p>Connected to server</p>"
  if username? then pubsub.join_room(username, chatroom)

pubsub.ondisconnect = ->
  $("#log").append "<p>Server connection lost</p>"

pubsub.onmessage = (msg) ->
  json_msg = JSON.stringify msg
  $("#log").append "<p>Message: #{json_msg}</p>"

pubsub.connect()