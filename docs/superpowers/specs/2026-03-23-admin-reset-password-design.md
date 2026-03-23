# Admin Reset Password — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add the ability for admins to reset a user's password from the admin panel. When reset, a random temporary password is generated, displayed on screen for the admin to copy and share out-of-band (e.g., Slack, text), and the user's existing sessions are revoked so they must log in with the new temp password.

## Tech Stack Context

- **Auth**: better-auth v1.5.3 with `emailAndPassword` and `admin` plugins already enabled
- **Database**: PostgreSQL (Neon) via Drizzle ORM
- **Framework**: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- **No email service configured** — password delivery is manual/out-of-band

## API

### `POST /api/admin/users/[id]/reset-password`

**Auth**: Requires admin role. Uses same pattern as existing admin routes (check session, verify `role === "admin"`).

**Request**: No body required. User ID comes from the route param.

**Logic**:
1. Verify caller is admin via `auth.api.getSession()`
2. Generate a 12-character cryptographically random temp password (alphanumeric, using `crypto.randomBytes`)
3. Call `auth.api.setUserPassword({ newPassword, userId })` via better-auth admin plugin
4. Call `auth.api.revokeUserSessions({ userId })` via better-auth admin plugin
5. Return `{ tempPassword: string }`

**Error responses**:
- 401 if not authenticated
- 403 if not admin
- 404 if user not found
- 500 on unexpected error

## UI Changes

### Admin Panel (`/src/app/admin/page.tsx`)

The existing admin panel already lists users. Add per-user:

1. **"Reset Password" button** — appears next to each user row
2. **Temp password modal/reveal** — shown after successful reset:
   - Displays the generated temp password
   - Copy-to-clipboard button
   - Warning text: "This password will not be shown again. Share it with the user now."
   - "Done" button to dismiss
3. **Loading state** on the button while the API call is in flight
4. **Error state** if the API call fails (inline message)

The password is only shown once — dismissing the modal clears it from state.

## Security Considerations

- Route is protected by admin role check (consistent with existing admin routes)
- Temp password is generated with `crypto.randomBytes` (not `Math.random`)
- User's existing sessions are revoked on reset — they cannot continue using old credentials
- Temp password is never logged or stored — only returned once in the API response

## Files to Create/Modify

| File | Change |
|------|--------|
| `src/app/api/admin/users/[id]/reset-password/route.ts` | **Create** — new API route |
| `src/app/admin/page.tsx` | **Modify** — add Reset Password button and modal UI |

## Out of Scope

- Self-service "Forgot Password" flow (no email service configured)
- Forcing password change on next login (better-auth does not natively support this without extra schema work)
- Password strength requirements for the temp password (it's admin-generated, not user-chosen)
