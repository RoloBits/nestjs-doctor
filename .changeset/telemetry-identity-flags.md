---
"nestjs-doctor": patch
---

`scan_completed` now carries three booleans: `id_stored` (the install id was read from `telemetry.json` rather than created on this run), `tty` (stderr is a terminal), and `hint_shown` (this run prints the one-time line pointing at a recurring trigger). `hint_shown` is decided before the event is sent, so the run that prints the line reports it. `hint_offered` is unchanged. Nothing new is printed, and every opt-out still stops the event.
