# Phase 6 changes

The pipeline page can now stop a live run, refuse a second run for the same account, and clean up rows that were still marked running after the server process starts again. Labels, settings, and Telegram were not changed. The CLI in `pipeline-master` was not changed.

## New files

- `lib/pipeline/killTree.js` — kills a process and its children. On Windows this is `taskkill /PID <pid> /T /F`, so Bun and the Chrome it launched both die. On other systems it signals the process group, then the process itself if there is no group.
- `lib/pipeline/cancelGuard.js` — remembers run ids that are being stopped, so the exit handler does not overwrite `cancelled` with `failed`.
- `lib/pipeline/recoverRuns.js` — once per server process, finds `status = running` rows, kills any stored pid, then marks those rows `failed` with `error_message = "server restarted"`.
- `app/api/pipeline/stop/route.js` — `POST /api/pipeline/stop` with `{ runId }`.

## Updated files

- `lib/pipeline/spawnRun.js` — refuses to start when that account already has a running row (`409`). Unix children are started in their own process group so they can be killed as a group. The exit handler leaves a cancelled run alone.
- `app/api/pipeline/start/route.js` — runs the stale-run cleanup before starting. A "run all accounts" request skips an account that is already running instead of failing the whole batch.
- `pipeline-runner.js` — `log_excerpt` keeps the last 200 KB. The full text still goes to `runs/<folder>/pipeline.log`.
- `app/api/pipeline/stream/route.js`, `app/api/pipeline/runs/route.js`, `app/api/pipeline/runs/[id]/route.js`, `app/pipeline/page.jsx` — call the same one-time cleanup so a restart is healed on the next pipeline page or pipeline API call.
- `app/pipeline/PipelineClient.jsx` — Stop button, Start disabled while that account is running, cancelled runs use the info badge. Stopping closes the log stream and reloads history.

## What the user sees

- Start a run, then Stop. The row becomes `cancelled`, `cancelled` is true, `end_time` is set, and `pid` is cleared.
- Start the same account again while that run is still going. The API returns 409: "A pipeline is already running for this account". The Start button is also disabled.
If the run is already success, failed, or cancelled, stop returns HTTP 200 with a short message instead of a server error.
- After a server restart, old running rows become failed with "server restarted".
