# Fixture: Evaluation and Revision Loop

Uses `tests/fixtures/benchmark/thin_evidence.json` directly (see the benchmark workspace, `/test-benchmark`) — one short, hedged piece of evidence ("one salon owner said the AI receptionist 'seemed to help'... didn't track exact numbers") supporting an otherwise ambitious content plan for "Is an AI Receptionist Worth It for Your Small Business?".

**Expected:** the evaluator flags any section that states specifics beyond that one hedged anecdote as needing evidence, driving a genuine `revise` outcome rather than silently accepting invented details.
