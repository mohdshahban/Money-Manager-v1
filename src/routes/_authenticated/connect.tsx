import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/connect")({
  component: ConnectPage,
  head: () => ({
    meta: [
      { title: "Connect AI assistants — Moneta" },
      { name: "description", content: "Connect ChatGPT or Claude to your Moneta money manager." },
    ],
  }),
});

function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-32">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Connect AI assistants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let ChatGPT or Claude read and add to your Moneta accounts, categories, transactions, and projects — acting as you.
        </p>
      </header>

      <section className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your MCP server URL</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-xl bg-muted px-3 py-2 text-sm">{mcpUrl || "…"}</code>
          <Button size="icon" variant="outline" onClick={copy} aria-label="Copy URL">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Paste this into your assistant's connector settings.</p>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Connect</h2>

        <div className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">ChatGPT</h3>
            <a
              href="https://chatgpt.com/#settings/Connectors/Advanced"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Open settings <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Open ChatGPT → Settings → Connectors → Advanced, and enable Developer mode.</li>
            <li>In the chat composer's "+" menu, turn on Developer mode.</li>
            <li>Click "Add sources", then "Connect more".</li>
            <li>Name the connector "Moneta" and paste the URL above.</li>
            <li>Approve the sign-in prompt, then ask ChatGPT to use Moneta.</li>
          </ol>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Claude</h3>
            <a
              href="https://claude.ai/customize/connectors?modal=add-custom-connector"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Add connector <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Open Claude → Connectors → Add custom connector.</li>
            <li>Name it "Moneta" and paste the URL above.</li>
            <li>Approve the sign-in prompt.</li>
            <li>Enable the connector from the chat composer, then ask Claude to use Moneta.</li>
          </ol>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Refresh after app updates</h2>
        <p className="text-sm text-muted-foreground">
          Assistants cache the tool list. After changes ship, refresh the connector to pick them up.
        </p>

        <div className="rounded-3xl border bg-card p-5">
          <h3 className="font-medium">ChatGPT</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Open ChatGPT's app preferences and select Moneta under "Enabled apps".</li>
            <li>Next to "Information", click "Refresh".</li>
            <li>If the URL changed, paste the latest URL from above.</li>
            <li>Start a new chat and ask ChatGPT to use Moneta.</li>
          </ol>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <h3 className="font-medium">Claude</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Open the Connectors page and select Moneta.</li>
            <li>Refresh or update the connector's tools.</li>
            <li>If the URL changed, paste the latest URL from above.</li>
            <li>Ask Claude to use Moneta.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}