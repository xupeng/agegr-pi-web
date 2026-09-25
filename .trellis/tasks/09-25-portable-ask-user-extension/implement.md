# Execution checklist

1. Prove extension entry discovery from a local directory and a host-supplied `open` adapter in an isolated SDK 0.85.1 fixture; record how PA's fixed-directory loader selects the same entry. Stop for design review if no safe bridge binding is possible.
2. Extract package/core and have Pi Web's inline factory import it, with no change to the ask state machine or wire protocol. Keep package metadata, license notice and SDK peer dependency scoped to the package.
3. Test missing bridge, malformed ask, supersede, result termination, Pi Web reload/toggle, and independent local installation. Run `node_modules/.bin/tsc --noEmit`, `npm run lint`, `XDG_STATE_HOME= npm test`; do not run `next build` on the dev checkout.
