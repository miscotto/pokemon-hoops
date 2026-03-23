# Admin Reset Password — Design Spec

**Date:** 2026-03-23
**Status:** Draft

## Overview

Add the ability for admins to reset a user's password from the admin panel. When reset, a random temporary password is generated, displayed on screen for the admin to copy and share out-of-band (e.g., Slack, text), and the user's existing sessions are revoked so they must log in with the new temp password.

## Tech Stack Context

- **Auth**: better-auth v1.5.3 with `emailAndPassword` and `admin` plugins already enabled
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Framework**: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- **No email service configured** — password delivery is manual/out-of-band

## New User List Section in Admin Panel

The admin panel (`/src/app/admin/page.tsx`) currently has no user list. This feature requires adding one.

**Data fetching**: A new API proxy route `GET /api/admin/users` will be created, following the same pattern as existing admin routes. It calls `auth.api.listUsers({ headers: await headers() })` and returns the user list. The admin panel client fetches from this endpoint on load, alongside existing tournament and season fetches.

Each user row will display: name, email, and a Reset Password button.

## API Routes

### `GET /api/admin/users`

**Auth**: Requires admin role via `getAdminUser()` (same helper used by all existing admin routes — returns `null` for both unauthenticated and non-admin, responds with `{ error: "Unauthorized" }` at status 401).

**Logic**: Calls `auth.api.listUsers({ headers: await headers(), query: { limit: 100 } })`. The response shape is `{ users: UserWithRole[], total: number }` — the route must extract and return `result.users`. Truncation at 100 users is acceptable for this app's scale.

---

### `POST /api/admin/users/[id]/reset-password`

**Auth**: Same as above — `getAdminUser()` pattern, 401 for both unauthenticated and non-admin.

**Self-reset guard**: If the target user ID matches the session user's own ID, return 400 with `{ error: "Cannot reset your own password" }`. This prevents an admin from locking themselves out mid-session.

**Logic**:
1. Verify caller is admin via `getAdminUser()`
2. Block self-reset (compare target `id` to session user id)
3. Verify target user exists — call `auth.api.getUser({ query: { id }, headers: await headers() })` (flat single-options-object convention). If the result is `null` or the call throws a not-found error, return 404
4. Generate a 12-character temp password: `crypto.randomBytes(9).toString('base64url').slice(0, 12)` (base64url gives alphanumeric + `-_`, ~72 bits of randomness across 12 chars)
5. Call `auth.api.setUserPassword({ body: { newPassword: tempPassword, userId: id }, headers: await headers() })` — note the `body` wrapper, which is required for this endpoint's call signature
6. Call `auth.api.revokeUserSessions({ body: { userId: id }, headers: await headers() })` — same `body` wrapper convention
7. If step 6 fails, still return the temp password but include a warning: `{ tempPassword, warning: "Sessions could not be revoked" }`
8. On success: return `{ tempPassword }`

**Error responses**:
- 400 if self-reset attempted
- 401 if not authenticated or not admin (matches existing pattern)
- 404 if user not found
- 500 on unexpected error

## UI Changes

### Admin Panel (`/src/app/admin/page.tsx`)

**New "Users" section** added alongside existing Tournaments and Seasons sections:

- Fetches from `GET /api/admin/users` on load
- Renders a list of users with: name, email, and a "Reset Password" button per row

**Reset Password flow (per user row)**:

1. Admin clicks "Reset Password" button
2. A confirmation prompt appears inline: "Reset password for [name]? This will log them out." with "Confirm" and "Cancel" buttons (same two-step pattern as the existing delete confirmation in the tournaments list)
3. On confirm: button shows loading state, API call fires
4. On success: a modal/reveal shows:
   - The temp password in a styled display
   - Copy-to-clipboard button
   - Warning: "This password will not be shown again. Share it with the user now."
   - "Done" button to dismiss — closing clears the password from state
5. On error: inline error message below the button
6. If the API returns a `warning` (sessions not revoked): show the temp password AND a notice: "Password was reset, but existing sessions could not be revoked."

## Security Considerations

- All routes protected by `getAdminUser()` — consistent with existing admin route pattern
- Temp password generated with `crypto.randomBytes` (not `Math.random`)
- Self-reset is blocked to prevent accidental admin lockout
- User existence verified before attempting password change
- Temp password never logged or stored — returned once in API response only
- Session revocation failure is surfaced but does not prevent password delivery

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/app/api/admin/users/route.ts` | **Create** — list users proxy route |
| `src/app/api/admin/users/[id]/reset-password/route.ts` | **Create** — reset password + revoke sessions |
| `src/app/admin/page.tsx` | **Modify** — add Users section with list and Reset Password UI |

## Out of Scope

- Self-service "Forgot Password" flow (no email service configured)
- Forcing password change on next login (requires schema work not justified here)
- Password strength requirements for the temp password (it's admin-generated, not user-chosen)
- Editing or deleting users from the admin panel
