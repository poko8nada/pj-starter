# Product presentation format

Present the plan in this format when the domain is product.

```
Agenda: login feature
Domain: product

Feature (from snapshots/product.json):
  Trigger: ユーザーが認証情報を送信する
  Result:  セッションが確立する
  Route:   [credential_check, session_create, login_endpoint]

Order:
  1. Split session logic out of the route handler (refactor)
     Route step: session_create
     Target: product.features.auth
     Depends on: none
     Files:
       - src/lib/auth/session.ts (create) — moved from src/routes/api.ts, behavior unchanged
     Tests:
       - existing src/routes/api.test.ts stays green
     Surface:
       - pnpm test:run passes with no test changes

  2. Session management
     Route step: session_create
     Target: product.features.auth
     Depends on: 1
     Files:
       - src/lib/auth/session.ts (modify)
         - createSession()
         - validateToken()
     Tests:
       - src/lib/auth/session.test.ts — unit: happy path + invalid token errors
     Surface:
       - pnpm test:run passes

  3. Login endpoint
     Route step: credential_check + login_endpoint
     Target: product.features.auth
     Depends on: 2
     Files:
       - src/routes/api.ts (modify)
         - handleLogin()
     Tests:
       - src/routes/api.test.ts — boundary: failure modes included
     Surface:
       - POST /api/login responds; trigger → result confirmed via curl
```

## Rules

- Feature block is read-only display from the snapshot
- Orders map to the feature's route steps; every route step is covered at least once, and dependency direction matches route order
- The last order's Surface verifies trigger → result end-to-end
