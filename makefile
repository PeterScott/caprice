CLOSURE_OPTS = --compilation_level SIMPLE_OPTIMIZATIONS
#CLOSURE_OPTS = --compilation_level WHITESPACE_ONLY --formatting PRETTY_PRINT

.PHONY: js clean

all: js

js: server/webroot/js/caprice-client.js

server/webroot/js/caprice-client.js: client/console-log.js client/pubsubcore-client.js client/pubsub_connect.js client/ctree.js client/coalesce.js client/protocol.js client/syncstring.js client/diff_match_patch.js client/sync-textarea.js
	java -jar client/compiler.jar --js client/console-log.js --js client/pubsubcore-client.js --js client/pubsub_connect.js --js client/ctree.js --js client/coalesce.js --js client/protocol.js --js client/syncstring.js --js client/diff_match_patch.js --js client/sync-textarea.js --js_output_file server/webroot/js/caprice-client.js $(CLOSURE_OPTS)

clean:
	rm -f server/webroot/js/caprice-client.js