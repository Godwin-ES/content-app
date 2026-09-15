# Fixture: Research and Source Grounding

**Topic:** AI agents in recruiting

**Candidate sources:**
1. `https://example.com/a` — HR Tech Journal, substantive article, expected `usable`.
2. `https://example.com/blocked` — a site known to refuse scraping (e.g. Reddit), expected `failed` with a real, specific error message.

**Expected evidence after retrieval:** at least one usable source with a curated evidence excerpt, conservative summary, and explicit supports/does-not-establish boundaries (see `EvidencePacketInput` in `lib/ai/prompts/shared-grounding.ts`).
