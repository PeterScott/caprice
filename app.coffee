#
# Chatting code here
#

username = null
chatroom = null

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
      PubSubCore.join_room username, chatroom;
      PubSubCore.add_handler chatroom, chat_handler
      $("#signin").hide()
      $("#chat").show()

  $("#chatline").keypress (e) ->
    if e.keyCode == 13
      text = $("#chatline").val()
      PubSubCore.send(chatroom, {name: username, text: text});
      $("#chatline").val ''

chat_handler = (msg) ->
  show_message msg.name, msg.text

PubSubCore.onannounce = (msg) ->
  $('#chatwindow').append "<p><i>#{msg.name} #{msg.action}</i></p>"

#
# Connection code
#

PubSubCore.onconnect = ->
  $("#log").append "<p>Connected to server</p>"
  if username? then PubSubCore.join_room(username, chatroom)

PubSubCore.ondisconnect = ->
  $("#log").append "<p>Server connection lost</p>"

PubSubCore.onmessage = (msg) ->
  json_msg = JSON.stringify msg
  $("#log").append "<p>Message: #{json_msg}</p>"

PubSubCore.connect()