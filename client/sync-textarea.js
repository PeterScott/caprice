function CapriceEditorCore(id, uuid, username, pubsub) {
    var text_state = "";
    var old_text3 = "";
    var self = this;
    var focused = false;
    var editor = document.getElementById(id);

    if (!editor) {
	alert('Error: synchronized textarea with id "' + id + '" not found.');
	return;
    }

    // Initialize document state and bind events.
    text_state = editor.value;
    editor.onkeyup = change_dispatch;
    editor.onpaste = function() { setTimeout(change_dispatch(), 20); };
    editor.onblur  = function() { focused = false; };
    editor.onfocus = function() { focused = true; periodically_check_for_changes(); };

    // Check to see if the text has changed. If it has, call
    // change_handler to deal with that change.
    function change_dispatch() {
	var current_text = editor.value;
	if (current_text !== text_state) {
	    change_handler(text_state, current_text);
	    text_state = current_text;
	}
    }

    // Poll the textarea for changes every 50 ms while it has the
    // focus. Sometimes the other change detection methods don't find
    // changes, so this is the ultimate fallback.
    function periodically_check_for_changes() {
	change_dispatch();
	if (focused)
	    setTimeout(periodically_check_for_changes, 50); // Every 50 ms
    }

    // Change the text of the editor without causing a change callback.
    function make_sneaky_change(new_text) {
	// change the text, find out the new position following that,
	// and move cursor to there. FIXME: does not work in IE.
	if (typeof editor.selectionStart !== 'undefined') {
	    // Find out which atom in the text3 precedes the cursor.
	    var spos = editor.selectionStart, epos = editor.selectionEnd;
	    var start_atom = old_text3.substring(spos*3-2, spos*3) || '01';
	    var end_atom = old_text3.substring(epos*3-2, epos*3) || '01';
	    var start_found = false, end_found = false;
	    // Change the text
	    editor.value = new_text;
	    text_state = new_text;
	    // Set selection start
	    var new_text3 = self.syncstring.text3;
	    if (start_atom == '01') {
		editor.selectionStart = 0;
	    } else {
		for (var i = 0; i < new_text3.length; i += 3) {
		    if (new_text3.substring(i+1, i+3) == start_atom) {
			editor.selectionStart = (i + 3) / 3;
			start_found = true;
			break;
		    }
		}
	    }
	    // Set selection end
	    if (end_atom == '01') {
		editor.selectionStart = 0;
	    } else {
		for (var i = 0; i < new_text3.length; i += 3) {
		    if (new_text3.substring(i+1, i+3) == end_atom) {
			editor.selectionEnd = (i + 3) / 3;
			end_found = true;
			break;
		    }
		}
	    }
	    // Handle selection area corner cases. Ugh.
	    if (start_found && !end_found) editor.selectionEnd = editor.selectionStart;
	    else if (!start_found && end_found) editor.selectionStart = editor.selectionEnd;
	} else {
	    console.log("FIXME: Internet Explorer must die.");
	    editor.value = new_text;
	    text_state = new_text;
	}
    }

    ////////////////////////////////////////
    // Detecting change spans
    ////////////////////////////////////////

    // Return the longest common prefix of the strings x and y.
    function common_prefix(x, y) {
	for (var i = 0; i < x.length && i < y.length; i++)
	    if (x[i] != y[i]) break;
	return x.substr(0, i);
    }

    // If the difference between old_text and new_text is a simple
    // insertion span, return that span.
    function get_insertion_span(old_text, new_text) {
	var prefix = common_prefix(old_text, new_text)
	var span_length = new_text.length - old_text.length;
	var position = prefix.length;
	return [position, new_text.substr(position, span_length)];
    }

    // If the difference between old_text and new_text is a simple
    // deletion span, return that span.
    function get_deletion_span(old_text, new_text) {
	var prefix = common_prefix(old_text, new_text)
	var span_length = old_text.length - new_text.length;
	var position = prefix.length;
	return [position, span_length];
    }

    // Return a list of insert and delete patches that will turn old_text
    // into new_text if applied in order. Uses some heuristics that work
    // fast, but may give a wrong answer -- and if those give a wrong
    // answer, falls back to using Google Diff-Match-Patch to compute an
    // exact diff, and derive patches from it.
    function get_patch(old_text, new_text) {
	if (old_text.length > new_text.length) {
	    var span = get_deletion_span(old_text, new_text);
	    span.unshift('d');
	    // Make sure the patch works.
	    var old_l = old_text.substring(0, span[1]);
	    var old_r = old_text.substring(span[1] + span[2]);
	    var new_l = new_text.substring(0, span[1]);
	    var new_r = new_text.substring(span[1]);
	    if (new_r === old_r && new_l === old_l)
		return [span];
	    else			// Mistake! Fall back to Diff-Match-Patch.
		return dmp_patch(old_text, new_text);
	} else {
	    var span = get_insertion_span(old_text, new_text);
	    span.unshift('i');
	    // Make sure the patch works.
	    var old_l = old_text.substring(0, span[1]);
	    var old_r = span[2] + old_text.substring(span[1]);
	    var new_l = new_text.substring(0, span[1]);
	    var new_r = new_text.substring(span[1]);
	    if (new_r === old_r && new_l === old_l)
		return [span];
	    else			// Mistake! Fall back to Diff-Match-Patch.
		return dmp_patch(old_text, new_text);
	}
    }

    ////////////////////////////////////////
    // Fallback: Diff-Match-Patch
    ////////////////////////////////////////

    var dmp = new diff_match_patch();

    // Use Diff-Match-Patch to create a list of insert and delete patches
    // that will turn old_text into new_text if applied in order. The code
    // does something slightly clever: in order to transform the D-M-P
    // output into patches, each insertion or removal chunk from D-M-P is
    // given an anchor point: its position in the string produced by
    // applying all previous patches. Unchanged and insertion chunks
    // advance the insertion point of subsequent patches, while deletion
    // chunks do not. This may be kind of slow, so try not to call it too
    // often.
    function dmp_patch(old_text, new_text) {
	var diffs = dmp.diff_main(old_text, new_text);
	dmp.diff_cleanupEfficiency(diffs);

	var anchor_point = 0;
	var patches = [];
	for (var i = 0; i < diffs.length; i++) {
	    var d = diffs[i];
	    if (d[0] === 1) {
		// Insert. Make patch and advance anchor point.
		patches.push(['i', anchor_point, d[1]]);
		anchor_point += d[1].length;
	    } else if (d[0] === -1) {
		// Delete. Make patch; do not advance anchor point.
		patches.push(['d', anchor_point, d[1].length]);
	    } else {
		// Neither insert nor delete. Advance anchor point.
		anchor_point += d[1].length;
	    }
	}
	return patches;
    }

    ////////////////////////////////////////
    // Applying lists of patches
    ////////////////////////////////////////

    // Apply a patch to a string, and return the result.
    function apply_patch(patch, string) {
	if (patch[0] === 'i')
	    return string.substring(0, patch[1]) + patch[2] + string.substring(patch[1]);
	else if (patch[0] === 'd')
	    return string.substring(0, patch[1]) + string.substring(patch[1] + patch[2]);
	else
	    console.log("Invalid patch:", patch);
    }

    // Apply a list of patches to a string, in order, and return it.
    function apply_patches(patches, string) {
	for (var i = 0; i < patches.length; i++)
	    string = apply_patch(patches[i], string);
	return string;
    }

    ////////////////////////////////////////
    // Server connection
    ////////////////////////////////////////

    // Set up connection to server.
    var syncstring = new SyncString(uuid, username, pubsub, got_remote_change, function(syncstring) {
	old_text3 = syncstring.text3;
	make_sneaky_change(syncstring.get_string());
    });

    // For debugging, expose this bit of internals.
    self.syncstring = syncstring;

    // Handle a change from old_text to new_text.
    function change_handler(old_text, new_text) {
	// If syncstring isn't defined yet, for some stupid reason,
	// wait until later.
	if (typeof(syncstring) === "undefined") return;

	var patches = get_patch(old_text, new_text);
	for (var i = 0; i < patches.length; i++) {
	    var patch = patches[i];
	    
	    if (patch[0] === 'i')
		syncstring.insert(patch[1], patch[2]);
	    else if (patch[0] === 'd')
		syncstring.del(patch[1], patch[2]);
	    else
		console.log("Invalid patch:", patch);
	}
    }

    // Callback for when we received a change from a remote client.
    function got_remote_change() {
	console.log("Got remote change.");
	make_sneaky_change(syncstring.get_string());
	old_text3 = syncstring.text3;
    }

    ////////////////////////////////////////
    // User list tracking
    ////////////////////////////////////////

    var user_list = {};
    user_list[username] = true;
    var num_users = 1;

    function show_user_list() {
	console.log('Users:', user_list);
	if (num_users === 1)
	    var text = "You're the only person editing this right now.";
	else if (num_users === 2)
	    var text = "There is one other person editing this right now.";
	else
	    var text = 'There are ' + (num_users - 1) + ' other people editing this right now.'
	document.getElementById('users_in_room').innerHTML = text;
    }

    function add_user_to_list(user) {
	if (!user_list.hasOwnProperty(user)) {
	    user_list[user] = true;
	    num_users++;
	}
    }

    function remove_user_from_list(user) {
	if (user_list.hasOwnProperty(user)) {
	    delete user_list[user];
	    num_users--;
	}
    }

    pubsub.add_handler('/rep/get_users', function(msg) {
	// Add all reported users to the user list
	for (var i = 0; i < msg.data.length; i++) {
	    add_user_to_list(msg.data[i]);	    
	}
	show_user_list();
    });

    pubsub.onannounce = function(msg) {
	if (msg.action === 'connected') {
	    add_user_to_list(msg.name);
	    show_user_list();
	} else if (msg.action === 'disconnected') {
	    remove_user_from_list(msg.name);
	    show_user_list();
	} else {
	    console.log("PubSubCore Announcement:", msg);
	}
    }

    pubsub.send('/req/get_users', {uuid: uuid});
}

// A wrapper for CapriceEditorCore which instantiates its inner
// object, self.core, only after pubsub has connected to the
// server. Until this happens, it waits for the pubsubcore onconnect
// event. However, the constructor returns immediately, with self.core
// set to null. If callback is given, it will be called with self.core
// as its argument as soon as the CapriceEditorCore is instantiated.
function CapriceEditor(id, uuid, username, pubsub, callback) {
    var self = this;
    self.core = null;

    if (pubsub.connected) {
	console.log('Pubsub already connected. Great.');
	self.core = new CapriceEditorCore(id, uuid, username, pubsub);
	callback && callback(self.core);
    } else {
	console.log('Pubsub not connected yet. Registering callback.');
	var old_onconnect = pubsub.onconnect;
	pubsub.onconnect = function() {
	    old_onconnect();
	    pubsub.onconnect = old_onconnect;
	    console.log('Pubsub connected; making editor core');
	    self.core = new CapriceEditorCore(id, uuid, username, pubsub);
	    callback && callback(self.core);
	}
    }
}