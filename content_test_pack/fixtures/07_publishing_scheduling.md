# Fixture: Publishing / Scheduling

A request with `status: approved` and a current package (all three channel versions and evaluations pinned).

**Scenarios to run in order:**
1. Queue LinkedIn immediately (no schedule).
2. Attempt to queue LinkedIn again immediately after — expect `DUPLICATE_QUEUE_ITEM`, not a duplicate row.
3. Schedule X for `now + 2h` in a real IANA timezone (e.g. `America/New_York`).
4. Attempt to schedule Newsletter for a time in the past — expect `VALIDATION_ERROR`.
5. Attempt to schedule Newsletter for a future time with an empty timezone string — expect `VALIDATION_ERROR`.
6. Reschedule the X item to `now + 4h`; confirm `content_requests.status` is still `approved`.
7. Cancel the LinkedIn item; expand its event history — expect `created` then `cancelled`, never deleted.
