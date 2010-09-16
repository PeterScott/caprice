socket = new io.Socket

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
      socket.send {connect: {name: username, room: chatroom}}
      $("#signin").hide()
      $("#chat").show()

  $("#chatline").keypress (e) ->
    if e.keyCode == 13
      text = $("#chatline").val()
      socket.send {name: username, text: text, room: chatroom}
      show_message username, text
      $("#chatline").val ''

chat_handler = (msg) ->
  if msg.announcement?
    $('#chatwindow').append "<p><i>#{msg.name} #{msg.action}</i></p>"
  else
    show_message msg.name, msg.text if msg.name != username

#
# Connection code
#

connected = false;

socket.on 'connect', ->
  connected = true
  console.log "Connected to server"
  $("#log").append "<p>Connected to server</p>"
  if username? then socket.send {connect: {name: username, room: chatroom}}

socket.on 'disconnect', ->
  connected = false
  console.log "Server connection lost"
  $("#log").append "<p>Server connection lost</p>"
  setTimeout reconnect, 5000 # Reconnect in 5 seconds

socket.on 'message', (msg) ->
  json_msg = JSON.stringify msg
  $("#log").append "<p>Message: #{json_msg}</p>"
  chat_handler msg

# Try to reconnect every five seconds until we succeed.
reconnect = ->
  console.log "Trying to connect. Retry in 5 seconds."
  socket.connect()
  setTimeout (() -> reconnect() unless connected), 5000

# Initially connect
reconnect()