# Phase 6 decisions

## Stop kills the tree, then writes the row

The stored pid is the Bun process. Chrome is a child of that process. Killing only Bun can leave Chrome open, so Windows uses `taskkill /T /F`.

The row is marked `cancelled` after the kill call. A small in-memory set records the run id first. The spawn exit handler checks that set and the database status. If the run is already being cancelled, a non-zero exit code is not saved as `failed`.

`pid` is cleared after a successful stop. A recycled operating-system pid must not be killed later by mistake.

If the run is already `success`, `failed`, or `cancelled`, stop returns HTTP 200 with `success: false` and a short message. That is a user state, not a broken server.

## One running row per account

The check lives in `startPipelineRun`, so both the single-account button and "run all accounts" share it. SQLite does not give us a unique "one running row" constraint, so two clicks in the same instant can still both pass the read. The normal case, a second click while the first is running, is rejected with 409.

"Run all" skips a busy account and starts the others. The header auto-sync uses that path and should not abort because one account is busy.

## Log cap is only the database copy

`pipeline.log` in the run folder stays the full log, including the Pino lines. `log_excerpt` is only the stage lines the runner writes, cut to the last 200 KB (`200 * 1024` characters). The old cap was 4,000 characters, which dropped useful context. 200 KB is enough for the history view and stays well under a SQLite problem.

## Cleanup runs once per Node process, on the first pipeline request

Next.js 14 in this app has no instrumentation hook turned on. A flag on `globalThis` runs the cleanup the first time a pipeline page or pipeline API is used after the process starts. Later requests in that same process do not touch live runs.

That flag survives a hot reload, so saving a file during a run does not mark the run as "server restarted". A real process restart clears the flag. Leftover running rows are then killed, if their pid is still alive, and marked failed.

Cleanup is not done from the home-page sync poll. Only pipeline routes and the pipeline page trigger it, which is the surface that owns these rows.

## The CLI stays a separate process

`bun main.js` in the `pipeline-master` folder does not create `PipelineRun` rows and is not part of this stop button. Stopping a dashboard run does not affect a CLI run started in a terminal.
