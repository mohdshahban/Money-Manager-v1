import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthAPI = {
  getAuthorizationDetails: (id: string) => Promise<{ data?: any; error?: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data?: any; error?: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data?: any; error?: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthAPI }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } as never });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-lg font-semibold">Could not load this authorization request</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as { client?: { name?: string; client_uri?: string; redirect_uris?: string[] }; scope?: string } | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an app";
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-[var(--shadow-lg)]">
        <h1 className="text-xl font-semibold tracking-tight">Connect {clientName} to Moneta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use Moneta as you — reading and creating your accounts, categories,
          transactions, and projects on your behalf. This does not bypass Moneta's permissions.
        </p>
        {details?.client?.redirect_uris?.[0] && (
          <p className="mt-3 break-all text-xs text-muted-foreground">Redirect: {details.client.redirect_uris[0]}</p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-2">
          <Button disabled={busy} onClick={() => decide(true)} className="flex-1" style={{ background: "var(--gradient-primary)" }}>
            Approve
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
            Deny
          </Button>
        </div>
      </div>
    </main>
  );
}