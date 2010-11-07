.PHONY: js clean

all: js

js: webroot/js/caprice-client.js

webroot/js/caprice-client.js: client/pubsubcore-client.js client/pubsub_connect.js client/ctree.js client/coalesce.js client/protocol.js client/syncstring.js client/diff_match_patch.js client/sync-textarea.js
	java -jar client/compiler.jar --js client/pubsubcore-client.js --js client/pubsub_connect.js --js client/ctree.js --js client/coalesce.js --js client/protocol.js --js client/syncstring.js --js client/diff_match_patch.js --js client/sync-textarea.js --js_output_file webroot/js/caprice-client.js

clean:
	rm -f webroot/js/caprice-client.js