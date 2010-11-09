Caprice: multi-user text editing
=====================

It seems like everybody's working on multi-user realtime document
editing from Google's now-defunct Wave, to Etherpad, to whatever
others are springing up today. I haven't found any that are a good
general platform for third parties to build on. Caprice is my attempt
to make something that you can add to your own apps if you need to
synchronize a document state.

It's a little rough right now, but there's a demo you can play with
that will give a simple text editor (technically, a textarea) which
several people can edit at once. To run it, first make sure you have
the prerequisites:

    npm install coffee-script paperboy redis simplesets socket.io uuid
    git clone git://github.com/PeterScott/pubsubcore.git
    npm link pubsubcore
    git clone git://github.com/PeterScott/caprice.git
    cd caprice
    make

That make was to compile and minify the client JavaScript, which is
created by bundling together a lot of JS files in `client/` with
Google's Closure Compiler.
    
Now, run a couple of daemons:

    redis-server &
    python patcher/patcherd.py &
    coffee server/caprice.coffee &
    
Turn your browser to [http://localhost:8124](http://localhost:8124/)
to try it out. To see the very minimal source code needed to include a
shared textarea in your HTML file, see `server/webroot/index.html` and
behold the simplicity.

Note that this is a pre-alpha double-plus-unrelease. You have been warned.
That said, it's also a lot of fun, and potentially very useful.
