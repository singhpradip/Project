import { Auth0Client } from "@auth0/nextjs-auth0/server";

// The server-side Auth0 client.
// - audience: makes Auth0 issue a JWT access token scoped to the Boardstack API.
// - organization: forces login through the Acme organization, so the token carries
//   the `org_id` claim (which resolveTenant uses to scope the request).
//   (In a real multi-tenant app this would be derived from the subdomain, not hardcoded.)
export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: "openid profile email",
    organization: "org_tHyJuYnxhAt1hNUz",
  },
});
