// Connection code for Caprice. Requires coalesce.js to combine
// patches; if this file is not available, patches will not be
// combined, but the code will still work.
var Weave = function(pubsub, uuid, username) {
    var self = this;
    self.uuid = uuid;

    self.patch_queue = [];

    function queue_patch(patch) {
	self.patch_queue.push(patch);
    }

    // Send patches to the server from the queue, as long as the
    // server is up. If there is more than one patch, attempt to
    // coalesce the queued patches first.
    function flush_patch_queue() {
	if (coalesce && self.patch_queue.length > 1)
	    self.patch_queue = coalesce.coalesce_patches(self.patch_queue);

	while (pubsub.connected && self.patch_queue.length > 0) {
	    pubsub.send('/weave/' + self.uuid, self.patch_queue.shift())
	}
    }

    // Attempt to flush the patch queue every 200 ms.
    function queue_flusher_process() {
	flush_patch_queue();
	if (pubsub.connected) setTimeout(queue_flusher_process, 200);
    }
    queue_flusher_process();

    self.insert = function(patch5c, weft2) {
	queue_patch(['i', patch5c, weft2]);
    }

    // NOTE: this is called delete in the Python version.
    self.del = function(patch5c) {
	queue_patch(['d', patch5c]);
    }

    self.save_edits = function(patch5c) {
	queue_patch(['s', patch5c]);
    }

    // Only the most recent status_callback value is called back.

    self.status_callback = function() {};

    pubsub.add_handler('/rep/weave_status', function(msg) {
	self.status_callback(msg.data);
    });

    self.get_weave_status = function(callback) {
	self.status_callback = callback;
	pubsub.send('/req/weave_status', {uuid: self.uuid});
    }

    var ps_oc = pubsub.onconnect;
    pubsub.onconnect = function() {
	setTimeout(queue_flusher_process, 200);
	pubsub.obconnect = function() {
	    setTimeout(queue_flusher_process, 11000); // 11 seconds to allow for others to reconnect.
	    ps_oc();
	};
    };

    self.subscribe = function() {
	pubsub.add_handler('/weave/' + self.uuid, function(msg) {
	    if (msg.data[0] == 'i') self.insert_received(msg.data);
	    else if (msg.data[0] == 'd') self.delete_received(msg.data);
	    else if (msg.data[0] == 's') self.save_edits_received(msg.data);
	    else console.log('Strange message', msg);
	});
	pubsub.join_room(username, '/weave/' + self.uuid);
    }

    self.created_weave_callback = function() {};
    pubsub.add_handler('/rep/create_weave', function(msg) {
	self.uuid = msg.uuid;
	self.created_weave_callback();
    });

    // Create a new weave, and set self.uuid to the UUID once it's
    // here. Then call callback.
    self.create_weave = function(callback) {
	self.created_weave_callback = callback;
	pubsub.send('/req/create_weave', null);
    }


    self.created_de_weave_callback = function() {};
    pubsub.add_handler('/rep/create_weave_if_not_exist', function(msg) {
	self.created_de_weave_callback();
    });

    // Create a new weave with self.uuid if it does not exist, or do
    // nothing if it does exist. Then call callback().
    self.create_weave_if_not_exist = function(callback) {
	self.created_de_weave_callback = callback;
	pubsub.send('/req/create_weave_if_not_exist', {uuid: self.uuid});
    }
    

    self.get_yarn_callback = function() {};
    pubsub.add_handler('/rep/get_yarn', function(msg) {
	self.get_yarn_callback(msg);
    });
    
    self.get_yarn = function(callback) {
        self.get_yarn_callback = function(msg) {
	    callback(msg.data);
	};
	pubsub.send('/req/get_yarn', {uuid: self.uuid, username: username});
    }

    // Callback functions, to be overridden by whoever uses this.
    self.insert_received = function(msg) {
	console.log(JSON.stringify(msg));
    }
    self.delete_received = function(msg) {
	console.log(JSON.stringify(msg));
    }
    self.save_edits_received = function(msg) {
	console.log(JSON.stringify(msg));
    }
}

// Create a new weave, and call callback(weave, status) where status
// has uuid, weave5c, and patches attributes.
function subscribe_create(pubsub, username, callback) {
    var w = new Weave(pubsub, null, username);
    w.create_weave(function() {
	w.subscribe();
	w.get_weave_status(function(status) {
	    callback(w, status);
	});
    });
}