# Fixture: Failure Handling

**Partial-failure scenario:** three article-option generation calls, where the second is deliberately malformed (fails schema validation) — expect options A and C to succeed and remain untouched while B is shown as failed with a working Retry control.

**Failure-injection gate scenario (dev server, `pnpm dev`, `ENABLE_FAILURE_INJECTION=true`):**

```bash
# No token — expect 404
curl -i -X POST http://localhost:3000/api/test/failure-mode \
  -H "Content-Type: application/json" -d '{"mode":"ai_generation_timeout"}'

# Wrong token — expect 404
curl -i -X POST http://localhost:3000/api/test/failure-mode \
  -H "Content-Type: application/json" -H "x-koya-test-token: wrong" \
  -d '{"mode":"ai_generation_timeout"}'

# Correct token, invalid mode — expect 400
curl -i -X POST http://localhost:3000/api/test/failure-mode \
  -H "Content-Type: application/json" -H "x-koya-test-token: $TEST_FAILURE_TOKEN" \
  -d '{"mode":"rm -rf /"}'

# Correct token, valid mode — expect 200 + HttpOnly Set-Cookie
curl -i -c cookies.txt -X POST http://localhost:3000/api/test/failure-mode \
  -H "Content-Type: application/json" -H "x-koya-test-token: $TEST_FAILURE_TOKEN" \
  -d '{"mode":"ai_generation_timeout"}'

# Clear it
curl -i -b cookies.txt -c cookies.txt -X DELETE http://localhost:3000/api/test/failure-mode \
  -H "x-koya-test-token: $TEST_FAILURE_TOKEN"
```

Repeat the "valid mode" step against a `pnpm build && pnpm start` (production) server — every step must return 404 regardless of token/flag, since `NODE_ENV=production` unconditionally blocks the gate.
