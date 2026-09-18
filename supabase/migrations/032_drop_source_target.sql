-- Koya Content Studio (Week 4) — the source target goes; it was never used.
--
-- 030 and 031 added a dial for how many pages a run should attempt, meant
-- to replace a "run more searches" button: raising it makes the searches
-- go deeper and return results a shallower run never reached. Both the
-- dial and the button were dropped before anything called them, so this
-- removes the columns and the RPC rather than leaving a setting nothing
-- reads.
--
-- How many pages a run attempts is back to a constant in
-- lib/research/service.ts, which is where it was before and where it can
-- stay until there is a reason for it to be a decision.

alter table content_requests drop column if exists source_target;
alter table content_requests drop column if exists researched_source_target;

drop function if exists set_source_target(uuid, integer);
