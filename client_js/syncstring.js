// Synchronized strings. Does not act like a normal string; rather, it
// supports insert and delete methods, and synchronizes its internal
// state with a remote server.

// Requires aimo.js, mars.js

// Random UUID generator function, taken from Robert Kieffer. This
// function is open source, as are any modified versions of it.
function randomUUID() {
    var s = [], itoh = '0123456789ABCDEF';

    // Make array of random hex digits. The UUID only has 32 digits in it, but we
    // allocate an extra items to make room for the '-'s we'll be inserting.
    for (var i = 0; i <36; i++) s[i] = Math.floor(Math.random()*0x10);

    // Conform to RFC-4122, section 4.4
    s[14] = 4;  // Set 4 high bits of time_high field to version
    s[19] = (s[19] & 0x3) | 0x8;  // Specify 2 high bits of clock sequence

    // Convert to hex chars
    for (var i = 0; i <36; i++) s[i] = itoh[s[i]];

    // Insert '-'s
    s[8] = s[13] = s[18] = s[23] = '-';

    return s.join('');
}

// Call this to get a new SSWeave connection. The parent is the parent
// SyncString. The other parameters are the same as in Weave.
function SSWeave(parent, pubsub, uuid, username) {
    var weave = new Weave(pubsub, uuid, username);

    weave.insert_received = function(msg) {
	if (msg[1][3] != parent.yarn) {
	    parent.apply_patch(msg, true);
	    parent.change_callback();
	}
    }

    weave.delete_received = function(msg) {
	if (msg[1][3] != parent.yarn) {
	    parent.apply_patch(msg, true);
	    parent.change_callback();
	}
    }

    weave.save_edits_received = function(msg) {
	if (msg[1][3] != parent.yarn)
	    parent.apply_patch(msg, true);
    }

    return weave;
}

// Note: this is a class constructor. Call with new keyword.
function SyncString(uuid, username, pubsub) {
    var self = this;
    
    self.uuid = uuid || randomUUID();
    console.log('uuid:', self.uuid);
    self.change_callback = function() {}; // no-op by default.

    self.weave = SSWeave(this, pubsub, self.uuid, username);
    // Check if this weave exists. If not, create it.
    self.weave.create_weave_if_not_exist(function() {
	self.weave.subscribe();
	self.weave.get_yarn(function(yarn) {
	    self.yarn = yarn;
	    console.log("My yarn: " + self.yarn);
	    self.weave.get_weave_status(function(status) {
		self.weave5c = status.weave5c;
		console.log('Starting weave5c: ' + self.weave5c);
		for (var i = 0; i < status.patches.length; i++)
		    self.apply_patch(status.patches[i]);
		console.log('After patches: ' + self.weave5c);
		self.text3 = scour(self.weave5c);
		
		var my_last_atom = last_atom_id5c(self.weave5c, self.yarn);
		if (my_last_atom)
		    self.yarn_offset = unicode_incr(my_last_atom[1]);
		else
		self.yarn_offset = '1';
		// Set up an incrementally updated awareness weft. Each
		// time we insert an atom, this weft is updated.
		self.incr_weft = {};
		self.incr_weft['0'] = '2';
		if (my_last_atom) {
		    // We have previous edits in this weave, and must
		    // rebuild our awareness weft.
		    console.log('rebuilding awareness weft');
		    self.incr_weft = pull(self.weave5c, self.yarn + unicode_incr(self.yarn_offset, -1),
					  false, self.incr_weft);
		    console.log('weft: ' + weft_to_weft2(self.incr_weft));
		}
	    });
	});
    });

    // Apply a patch, in list format, to self.weave5c
    self.apply_patch = function(patch, scour_it) {
	console.log('Applying patch:', patch);
	if      (patch[0] === 'i')
            self.weave5c = apply_insert_patch(self.weave5c, patch[1], patch[2]);
        else if (patch[0] === 'd')
            self.weave5c = apply_delete_patch(self.weave5c, patch[1]);
        else if (patch[0] === 's')
            self.weave5c = apply_save_edits_patch(self.weave5c, patch[1]);
        else
            console.log('Error: invalid patch ' + patch); // HOW DID THIS HAPPEN??!

        if (scour_it) self.text3 = scour(self.weave5c);
    }

    // Create an apply an insert patch
    self.insert = function(position, text) { // FIXME: make scour optional
	self.become_aware_of(position-1, 2);
	var causing_id = self.text3.substring(position*3-2, position*3) || '01';
	var head_id = self.yarn + self.yarn_offset;
	self.yarn_offset = unicode_incr(self.yarn_offset, text.length);
	var patch5c = make_insert_patch5c(text, causing_id, head_id);
	var weft2 = weft_to_weft2(self.incr_weft);
	self.apply_patch(['i', patch5c, weft2], true);
	// Note: pulling must happen after patch has been applied.
        // This is also true for delete and save-edits patches.
	self.incr_weft = pull(self.weave5c, patch5c.substring(patch5c.length-2),
			      false, self.incr_weft);
	self.weave.insert(patch5c, weft2);
    }

    // Create and apply a delete patch. NOTE: this is self.delete in Python.
    self.del = function(start_position, length) {
	self.become_aware_of(start_position, length);
	var head_id = self.yarn + self.yarn_offset;
	self.yarn_offset = unicode_incr(self.yarn_offset, length);
	var patch5c = make_delete_patch5c(self.text3, start_position, length, head_id);
	self.apply_patch(['d', patch5c], true);
	self.incr_weft = pull(self.weave5c, patch5c.substring(patch5c.length-2),
			      false, self.incr_weft);
	self.weave.del(patch5c);
    }

    // Create and apply a save-edits patch for the given atom
    // ids. This is mainly meant to be used internally; if client code
    // calls it, something magical is probably happening.
    self.save_edits = function(atom_ids) {
	var head_id = self.yarn + self.yarn_offset;
	self.yarn_offset = unicode_incr(self.yarn_offset, atom_ids.length);
	var patch5c = make_save_edits_patch5c(atom_ids, head_id);
	self.apply_patch(['s', patch5c], true);
	self.incr_weft = pull(self.weave5c, patch5c.substring(patch5c.length-2),
			      false, self.incr_weft);
	self.weave.save_edits(patch5c);
    }

    // Are we currently aware of other_id?
    self.aware_of = function(other_id) {
	var yarn = other_id[0], offset = other_id[1];
	var current_top = self.incr_weft[yarn] || '0';
	return offset <= current_top;
    }

    // Become causally aware of all currently-known atoms in the yarns
    // of any atoms contained in the span starting at start_position
    // with a given length. Send a save-edits patch if
    // necessary. Update the current awareness weft. Ignore any part
    // of the span which lies outside text3.
    self.become_aware_of = function(start_position, length) {
	// Get start and end position in terms of text3
        start_position *= 3;
        var end_position = start_position + length*3;
	// Adjust span to ignore anything outside text3
	if (start_position < 0) start_position = 0;
        if (end_position > self.text3.length) end_position = self.text3.length;
	// Go through span looking for atoms we're not aware of.
	var last_atom_ids = [];
	for (var i = start_position; i < end_position; i += 3) {
	    var atom_id = self.text3.substring(i+1, i+3);
	    if (!self.aware_of(atom_id)) {
		// Become aware of this atom's yarn
		var last_atom_id_in_yarn = last_atom_id5c(self.weave5c, atom_id[0]);
                last_atom_ids.push(last_atom_id_in_yarn);
                self.incr_weft = pull(self.weave5c, last_atom_id_in_yarn, false, self.incr_weft);
	    }
	}
	// Take the atom ids to become aware of, and save the edits.
	if (last_atom_ids.length > 0)
	    self.save_edits(last_atom_ids);
    }

    // Append text to the end of the string. This is a convenience
    // method which uses insert behind the scenes.
    self.append = function(text) {
	self.insert(self.text3.length / 3, text);
    }

    self.get_string = function() {
	return stringify(self.text3);
    }

    // Register a callback function to be called whenever the text
    // changes due to a remote patch being applied.
    self.set_change_callback = function(callback) {
	self.change_callback = callback;
    }
}

// Testing code
///////////////

// var ss;

// $(function() {
//     console.log("Starting!");
//     ss = new SyncString();
//     setTimeout('test_ss();', 1000);
// });

// function test_ss() {
//     console.log("Testing SyncString.");
//     ss.append('Hello, wrold!');
//     console.log("hello");
//     console.log(ss.weave5c);
//     ss.del(8, 2);
//     console.log("del");
//     ss.insert(8, 'or');
//     console.log(ss.weave5c);
//     console.log("text: " + ss.get_string());
// }