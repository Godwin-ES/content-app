-- Koya Content Studio (Week 4) — the model choice is not a test setting.
--
-- test_model_choice was named for the Test & Benchmark section, which is
-- gone. The column does something ordinary and permanent: it records which
-- AI model a request was made with. Whether someone is *allowed* to choose
-- is still a deployment decision — that gate simply has nothing to do with
-- testing, and its env var is renamed to say so (ALLOW_MODEL_SELECTION).

alter table content_requests rename column test_model_choice to ai_model_choice;
