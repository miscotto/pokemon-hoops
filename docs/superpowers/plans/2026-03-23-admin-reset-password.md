# Admin Reset Password Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to reset any user's password from the admin panel, generating a temporary password that is displayed once for manual sharing.

**Architecture:** Two new API routes follow the existing `getAdminUser()` guard pattern. The admin panel gains a new "Users" section with per-user Reset Password button, two-step confirmation, and a one-time temp password reveal modal.

**Tech Stack:** Next.js App Router, React 19 (client components), TypeScript, better-auth v1.5.3 admin plugin, Tailwind CSS 4, Vitest (node environment)

**Spec:** `docs/superpowers/specs/2026-03-23-admin-reset-password-design.md`

**Tech Debt Note:** `getAdminUser()` is defined inline in each admin route file (matching the existing pattern in `src/app/api/admin/tournaments/route.ts`). This results in three copies of identical code. Extracting to a shared utility is out of scope for this feature but is a known debt item.

---

## Chunk 1: GET /api/admin/users route

### Task 1: Write and pass tests for GET /api/admin/users

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/route.test.ts`

**Note on vitest mocking:** vitest hoists `vi.mock()` calls above static imports at compile time. Use static imports — do NOT use `await import()` after mocks.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/admin/users/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
const mockListUsers = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      listUsers: mockListUsers,
    },
  },
}));

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue({ users: [], total: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when user is not admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "user@test.com", role: "user" },
    });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns user list when admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", email: "admin@test.com", role: "admin" },
    });
    mockListUsers.mockResolvedValue({
      users: [
        { id: "u1", name: "Admin", email: "admin@test.com" },
        { id: "u2", name: "Player", email: "player@test.com" },
      ],
      total: 2,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].email).toBe("admin@test.com");
    expect(mockListUsers).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 100 } })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npx vitest run src/app/api/admin/users/route.test.ts
```

Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/users/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

// GET /api/admin/users — List all users (admin only)
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: 100 },
  });

  return NextResponse.json(result.users);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/api/admin/users/route.test.ts
```

Expected: PASS — 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/users/route.test.ts
git commit -m "feat: add GET /api/admin/users route"
```

---

## Chunk 2: POST /api/admin/users/[id]/reset-password route

### Task 2: Write and pass tests for POST reset-password

**Files:**
- Create: `src/app/api/admin/users/[id]/reset-password/route.ts`
- Create: `src/app/api/admin/users/[id]/reset-password/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/admin/users/[id]/reset-password/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockSetUserPassword = vi.fn();
const mockRevokeUserSessions = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      getUser: mockGetUser,
      setUserPassword: mockSetUserPassword,
      revokeUserSessions: mockRevokeUserSessions,
    },
  },
}));

const makeRequest = (targetId: string) =>
  new NextRequest(`http://localhost/api/admin/users/${targetId}/reset-password`, {
    method: "POST",
  });

const makeParams = (id: string) => Promise.resolve({ id });

describe("POST /api/admin/users/[id]/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetUserPassword.mockResolvedValue({});
    mockRevokeUserSessions.mockResolvedValue({});
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when not admin", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "user" },
    });

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(401);
  });

  it("returns 400 when admin tries to reset their own password", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });

    const res = await POST(makeRequest("u1"), { params: makeParams("u1") });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Cannot reset your own password" });
  });

  it("returns 404 when target user does not exist", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue(null);

    const res = await POST(makeRequest("u99"), { params: makeParams("u99") });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "User not found" });
  });

  it("returns 500 when setUserPassword throws unexpectedly", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });
    mockSetUserPassword.mockRejectedValue(new Error("unexpected db error"));

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Failed to reset password" });
  });

  it("returns tempPassword on success", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
    expect(body.tempPassword.length).toBe(12);
  });

  it("returns tempPassword with warning when session revocation fails", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    });
    mockGetUser.mockResolvedValue({ id: "u2", email: "player@test.com" });
    mockRevokeUserSessions.mockRejectedValue(new Error("revoke failed"));

    const res = await POST(makeRequest("u2"), { params: makeParams("u2") });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
    expect(body.warning).toBe("Sessions could not be revoked");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/app/api/admin/users/
```

Expected: FAIL — `Cannot find module './route'` (in the reset-password test)

- [ ] **Step 3: Implement the route**

Create `src/app/api/admin/users/[id]/reset-password/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import crypto from "crypto";

async function getAdminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user ?? null;
  if (!user) return null;
  if ((user as { role?: string }).role !== "admin") return null;
  return user;
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

// POST /api/admin/users/[id]/reset-password
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (id === admin.id) {
    return NextResponse.json({ error: "Cannot reset your own password" }, { status: 400 });
  }

  let targetUser: { id: string } | null = null;
  try {
    targetUser = await auth.api.getUser({ query: { id }, headers: await headers() });
  } catch {
    targetUser = null;
  }
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();

  try {
    await auth.api.setUserPassword({
      body: { newPassword: tempPassword, userId: id },
      headers: await headers(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }

  try {
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: await headers(),
    });
  } catch {
    return NextResponse.json({ tempPassword, warning: "Sessions could not be revoked" });
  }

  return NextResponse.json({ tempPassword });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/app/api/admin/users/
```

Expected: PASS — all 9 tests pass (3 from GET route + 6 from POST route)

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/admin/users/[id]/reset-password/route.ts" "src/app/api/admin/users/[id]/reset-password/route.test.ts"
git commit -m "feat: add POST /api/admin/users/[id]/reset-password route"
```

---

## Chunk 3: Admin panel UI — Users section

### Task 3: Add Users section to the admin panel

**Files:**
- Modify: `src/app/admin/page.tsx`

No UI tests — no React Testing Library setup in this project.

**Overview of changes to `page.tsx`:**

1. Add `User` interface
2. Add state: `users`, `confirmResetId`, `resetting`, `resetResult` (holds `{ userId, tempPassword, warning? }`)
3. Add `fetchUsers` callback (calls `GET /api/admin/users`)
4. Call `fetchUsers()` in the existing `useEffect`
5. Add `handleResetPassword(id)` function
6. Add "USERS" section to the JSX (below Seasons list, above Tournament list)

- [ ] **Step 1: Add the `User` interface and new state variables**

In `src/app/admin/page.tsx`, add after the `Tournament` interface (line 28):

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}
```

Add new state after the existing `deleting` state (after line 46):

```typescript
// Users / reset password
const [users, setUsers] = useState<User[]>([]);
const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
const [resetting, setResetting] = useState(false);
const [resetError, setResetError] = useState("");
const [resetResult, setResetResult] = useState<{
  userId: string;
  tempPassword: string;
  warning?: string;
} | null>(null);
```

- [ ] **Step 2: Add `fetchUsers` and wire it into the existing `useEffect`**

Add after `fetchSeasons` (after line 77):

```typescript
const fetchUsers = useCallback(async () => {
  const res = await fetch("/api/admin/users");
  if (res.ok) {
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  }
}, []);
```

Update the `useEffect` to also call `fetchUsers()`:

```typescript
useEffect(() => {
  if (!isPending && session?.user) {
    fetchTournaments();
    fetchSeasons();
    fetchUsers();
  } else if (!isPending && !session?.user) {
    setAuthorized(false);
    setLoading(false);
  }
}, [isPending, session, fetchTournaments, fetchSeasons, fetchUsers]);
```

- [ ] **Step 3: Add `handleResetPassword` function**

Add before `handleCreate` (before line 130):

```typescript
const handleResetPassword = async (id: string) => {
  setResetting(true);
  setResetError("");
  const res = await fetch(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
  });
  const data = await res.json();
  if (res.ok) {
    setResetResult({ userId: id, tempPassword: data.tempPassword, warning: data.warning });
    setConfirmResetId(null);
  } else {
    setResetError(data.error || "Failed to reset password");
  }
  setResetting(false);
};
```

- [ ] **Step 4: Add the Users section to the JSX**

Add before the `{/* Tournament List */}` comment (before line 462), inside the `<div className="max-w-5xl mx-auto px-4 py-8 space-y-8">`:

```tsx
{/* Users List */}
<div>
  <h2
    className="font-pixel text-[9px] mb-4"
    style={{ color: "var(--color-text)" }}
  >
    ALL USERS ({users.length})
  </h2>

  {/* Temp password reveal */}
  {resetResult && (
    <div
      className="mb-4 p-4 border-2 border-(--color-primary)"
      style={{ backgroundColor: "var(--color-surface-alt)" }}
    >
      <p
        className="font-pixel text-[6px] mb-2"
        style={{ color: "var(--color-danger)" }}
      >
        ⚠ THIS PASSWORD WILL NOT BE SHOWN AGAIN. SHARE IT WITH THE USER NOW.
      </p>
      {resetResult.warning && (
        <p
          className="font-pixel text-[5px] mb-2"
          style={{ color: "var(--color-accent)" }}
        >
          ⚠ {resetResult.warning.toUpperCase()}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span
          className="font-pixel text-[8px] tracking-widest px-3 py-1 border border-(--color-shadow)"
          style={{
            backgroundColor: "var(--color-bg)",
            color: "var(--color-primary)",
          }}
        >
          {resetResult.tempPassword}
        </span>
        <PokeButton
          variant="ghost"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(resetResult.tempPassword)
          }
        >
          COPY
        </PokeButton>
        <PokeButton
          variant="primary"
          size="sm"
          onClick={() => setResetResult(null)}
        >
          DONE
        </PokeButton>
      </div>
    </div>
  )}

  {users.length === 0 ? (
    <PokeCard variant="default" className="p-8 text-center">
      <p
        className="font-pixel text-[7px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        NO USERS FOUND.
      </p>
    </PokeCard>
  ) : (
    <div className="space-y-2">
      {users.map((u) => (
        <PokeCard key={u.id} variant="default" className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3
                className="font-pixel text-[8px] truncate"
                style={{ color: "var(--color-text)" }}
              >
                {u.name.toUpperCase()}
              </h3>
              <p
                className="font-pixel text-[5px] mt-1"
                style={{ color: "var(--color-text-muted)" }}
              >
                {u.email}
              </p>
            </div>
            <div className="shrink-0 flex gap-2 items-center">
              {confirmResetId === u.id ? (
                <>
                  <PokeButton
                    variant="danger"
                    size="sm"
                    disabled={resetting}
                    onClick={() => handleResetPassword(u.id)}
                  >
                    {resetting ? "..." : "CONFIRM?"}
                  </PokeButton>
                  <PokeButton
                    variant="ghost"
                    size="sm"
                    disabled={resetting}
                    onClick={() => setConfirmResetId(null)}
                  >
                    CANCEL
                  </PokeButton>
                </>
              ) : (
                <PokeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResetResult(null);
                    setResetError("");
                    setConfirmResetId(u.id);
                  }}
                >
                  RESET PASSWORD
                </PokeButton>
              )}
              {confirmResetId === u.id && resetError && (
                <span
                  className="font-pixel text-[5px]"
                  style={{ color: "var(--color-danger)" }}
                >
                  {resetError}
                </span>
              )}
            </div>
          </div>
        </PokeCard>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 5: Run the TypeScript compiler to verify no type errors**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Run all project tests**

```bash
npx vitest run src/
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add users list and reset password UI to admin panel"
```

---

## Final verification

- [ ] **Step 1: Build the project**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 2: Commit build success (if needed)**

If the build surfaces any type errors not caught by `tsc --noEmit`, fix them and amend the last commit.
