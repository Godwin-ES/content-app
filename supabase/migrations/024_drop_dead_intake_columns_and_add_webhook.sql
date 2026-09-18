-- Koya Content Studio (Week 4) — three columns nothing writes, and one the
-- settings page now does.
--
-- publication_date, additional_instructions and source_urls were all
-- written from intake fields that no longer exist. Two of them are worse
-- than merely dead: live code still reads them and silently gets nothing.
--
--   publication_date        never written, never read.
--   additional_instructions never written, but fed to the research
--                           planner's prompt on every run — a prompt line
--                           that could never appear.
--   source_urls             always '[]'. Supplied URLs have not lived here
--                           since they became research_sources rows with
--                           origin 'user_url' at intake; runResearchPipeline
--                           read this column *as well*, picking up an empty
--                           array beside the real sources.
--
-- Verified against the live database before writing this: the one real
-- request holds null, null and [].

alter table content_requests drop column if exists publication_date;
alter table content_requests drop column if exists additional_instructions;
alter table content_requests drop column if exists source_urls;

-- ---------------------------------------------------------------------------
-- Your own Discord, not the deployment's
--
-- Notifications went to whatever webhook the server was configured with,
-- which is fine for one operator and wrong for anyone else: the person who
-- should hear that their package was approved is the person who owns it.
-- The env vars stay as the fallback, so a deployment can still have a
-- catch-all channel and an account can override it.
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists discord_webhook_url text null;

/**
 * Sets or clears the account's own Discord webhook.
 *
 * The URL is checked here as well as in the application because the server
 * will make an outbound POST to whatever is stored: anything that is not a
 * Discord webhook endpoint is a request the app should not be tricked into
 * making on someone's behalf.
 */
create or replace function set_discord_webhook_url(p_url text) returns profiles as $$
declare
  v_profile profiles;
  v_value text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_value is not null and v_value !~ '^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_\-]+$' then
    raise exception 'VALIDATION_ERROR: that is not a Discord webhook URL';
  end if;

  update profiles set discord_webhook_url = v_value where user_id = auth.uid()
  returning * into v_profile;

  if v_profile.user_id is null then
    raise exception 'NOT_FOUND: no profile for the current user';
  end if;

  return v_profile;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function set_discord_webhook_url(text) from public, anon;
grant execute on function set_discord_webhook_url(text) to authenticated;

-- profiles is world-readable to any signed-in account (profiles_select_authenticated),
-- which was harmless for a display name and is not for a webhook: anyone
-- holding it can post into that channel. Narrowed to your own row.
drop policy if exists profiles_select_authenticated on profiles;

create policy profiles_select_own on profiles
  for select to authenticated
  using (user_id = auth.uid());
