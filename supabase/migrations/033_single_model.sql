-- Koya Content Studio (Week 4) — one model, configured server-side.
--
-- ai_model_choice existed so a request could name which of three models
-- generated it. There is one now (ANTHROPIC_MODEL), chosen by whoever
-- deploys the app, so the column recorded a decision nobody makes.

alter table content_requests drop column if exists ai_model_choice;
