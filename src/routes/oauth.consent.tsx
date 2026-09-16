import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search.authorization_id === "string" ? search.authorization_id : "",
  }),
  beforeLoad: ({ search }) => {
    const authorizationId = search.authorization_id;
    if (!authorizationId) {
      throw new Error("Missing authorization_id");
    }

    throw redirect({
      href: `/.lovable/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
    });
  },
});
