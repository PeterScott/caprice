// console.log replacement for browsers that don't support it. At the
// moment, this is just a no-op. If you want to debug on such
// browsers, a more featureful replacement would push messages onto a
// list. This does nothing on browsers (e.g. Safari and Chrome) which
// have console.log by default.

window.console = ('console' in window) ? window.console : { log: function() {} };
