import { auth0 } from "@/lib/auth0";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Server-side: get a fresh access token and call the Boardstack API.
// (No manual token copying — avoids truncation/signature errors.)
async function fetchProjects() {
  try {
    const { token } = await auth0.getAccessToken();
    const res = await fetch(`${API_URL}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) return { ok: false as const, status: res.status, body };
    return { ok: true as const, data: JSON.parse(body).data };
  } catch (e: any) {
    return { ok: false as const, status: 0, body: e.message };
  }
}

export default async function Home() {
  const session = await auth0.getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 dark:bg-black">
      <h1 className="text-2xl font-semibold tracking-tight">Boardstack</h1>

      {!session ? (
        <div className="flex gap-3">
          <a
            href="/auth/login?organization=org_tHyJuYnxhAt1hNUz&screen_hint=signup"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
          >
            Sign up
          </a>
          <a
            href="/auth/login?organization=org_tHyJuYnxhAt1hNUz"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Log in to Acme
          </a>
        </div>
      ) : (
        <LoggedIn email={session.user.email ?? session.user.name} />
      )}
    </main>
  );
}

async function LoggedIn({ email }: { email?: string }) {
  const result = await fetchProjects();

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <p className="text-zinc-600 dark:text-zinc-400">
        Logged in as <span className="font-medium text-black dark:text-white">{email}</span>
      </p>

      <div className="w-full rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold">Projects (from the API, RLS-scoped)</h2>
        {result.ok ? (
          result.data.length ? (
            <ul className="space-y-1 text-sm">
              {result.data.map((p: any) => (
                <li key={p.id} className="flex justify-between">
                  <span className="font-mono">{p.key}</span>
                  <span className="text-zinc-500">{p.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No projects yet.</p>
          )
        ) : (
          <pre className="overflow-auto rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            API error {result.status}: {result.body}
          </pre>
        )}
      </div>

      <a
        href="/auth/logout"
        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
      >
        Log out
      </a>
    </div>
  );
}
