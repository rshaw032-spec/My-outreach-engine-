# Phase 0: Payload-First Security TDD
## Data Invariants
1. A user profile document ID must strictly match the authenticated user's UID.
2. A lead must belong to a project/user path and match the request.auth.uid.
3. No field arrays can be unbounded.

## Dirty Dozen Payloads
1. Create user with different ID
2. Create lead with wrong userId
3. Add ghost field `isAdmin: true`
4. Update `createdAt` after creation
5. Bypass terminal status (Skipped -> Not Sent)
6. Inject 5MB into `name` field
...
