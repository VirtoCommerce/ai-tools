// vc-secrets-teardown.mjs -- the one way this package closes a server it listens on.
//
// `server.close()` stops accepting and then WAITS on the connections already open. An http.Server
// makes one exception -- it severs a connection sitting IDLE between requests -- and that exception is
// what makes the rule easy to miss: a socket that completed a request does go away, so a teardown
// reads as correct until a peer connects and says nothing. A net.Server makes no exception at all and
// waits on every connection it holds. Both measured on node 22.
//
// A peer that connects and then stays silent is a browser's speculative preconnect to the sign-in
// redirect, or a neighbour that reached the refresh lock. A teardown built on close() alone therefore
// resolves when the peer feels like it, which on the sign-in path was never -- measured on Windows,
// `login` sat past 88 s with the tokens already stored and the browser showing "Signed in", and
// closing the tab did not release it.
//
// This lives in a module of its own rather than beside any one server because the package has three,
// in two files, and for as long as each wrote its own teardown the rule reached exactly one of them.
// A fourth server gets it by calling this, or it does not get it at all and that is visible here.

// `destroy`, never `end`: end() half-closes and still waits on the peer to close its own direction,
// which is the same hang wearing a politer API. A test that only asserts "the teardown resolved"
// cannot tell the two apart -- the one here connects with allowHalfOpen so that it can.
function severingClose(server) {
    const open = new Set();
    // Two of the three callers attach before `listen`. holderFor cannot -- it is handed a server that
    // is already listening -- and what keeps that safe is the event loop rather than luck: `connection`
    // is emitted from the poll phase, and the microtask queue drains completely before the loop
    // advances, so attaching one microtask after listen cannot miss a peer. A MACROtask there would:
    // measured, a single setTimeout inserted between the listen callback and this attach reinstates
    // the hang. So an `await` added inside bindSocket is what breaks it, and nothing pins that.
    server.on("connection", (sock) => {
        open.add(sock);
        sock.on("close", () => open.delete(sock));
    });

    return () => new Promise((done) => {
        for (const sock of open) {
            sock.destroy();
        }
        open.clear();
        server.close(done);
    });
}

export { severingClose };
