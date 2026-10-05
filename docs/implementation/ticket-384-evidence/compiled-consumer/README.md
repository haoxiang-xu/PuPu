# Isolated compiled consumer fixture

This QA-only entry compiles the candidate's actual `TraceChain`, runtime event store/reducer/adapter, interrupted-message settlement helper, and chat storage through the installed candidate CRA webpack production configuration. The entry does not import `src/index.js`, Electron, an application bridge, or any model/approval transport. It consumes the exact accepted baseline producer fixture from the repository and writes isolated local chat records.

From the repository root, build with:

```sh
node docs/implementation/ticket-384-evidence/compiled-consumer/build.cjs
```

The bundle, generated minimal QA-only HTML, and `build-report.json` are written under ignored `.local/ticket-384-ui/`. To serve it for a separate isolated browser review, use a disposable profile/context and a unique loopback port, for example:

```sh
python3 -m http.server 2924 --bind 127.0.0.1 --directory .local/ticket-384-ui
```

The UI has explicit Seed Generic, Seed Nested, and Seed Approval controls. Only those actions write a scenario record. Switch away hides the saved trace in a separate chat; Return to saved chat reloads the original storage record. Cold reload reads the chat and scenario identity from the URL and renders that saved record without reseeding. `persisted` exposes the saved assistant record for byte-for-byte JSON comparison and identity/order/payload checks. The approval callback only increments a local counter; no approval request can be submitted. Root owns browser execution and visual inspection.

`build-report.json` records relevant source hashes, compiled bundle hash, and the exact accepted wheel/manifest hashes. This fixture demonstrates the compiled candidate consumer and storage behavior. It does not demonstrate a deployed runtime/bridge cancellation or restart.

Root verification runs with `node docs/implementation/ticket-384-evidence/compiled-consumer/verify.cjs` after serving the bundle. It launches a fresh temporary headless Chromium context, permits only GET requests for this fixture's HTML and bundle, blocks service workers/other paths, and verifies the served bundle hash. Set `TICKET384_CHROMIUM` to an already installed Chromium binary when the recorded Mac path differs; no browser download or normal user profile is needed.

Recorded result: all three scenarios pass. Switch-away removes the original consumer; Return and cold page reload preserve identical saved assistant JSON bytes. The actual production detail controls show the first call's own argument/result, the unfinished second call's own argument, nested worker arguments and cancelled/interrupted status, and a pending approval with no action buttons. Root waited for finite detail-opening transitions and inspected the saved screenshots. No browser errors, bridge globals, external requests, provider/approval endpoints or live app were observed. This entry seeds already-interrupted records; actual Stop timing is established by the real-hook regressions, not by this UI entry.
