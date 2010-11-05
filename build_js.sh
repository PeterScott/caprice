#!/bin/sh

cd client_js
java -jar compiler.jar --js pubsubcore-client.js --js pubsub_connect.js --js aimo.js --js coalesce.js --js mars.js --js syncstring.js --js diff_match_patch.js --js sync-textarea.js --js_output_file ../webroot/js/script.js  --compilation_level WHITESPACE_ONLY
