import { auth } from "express-oauth2-jwt-bearer";

// Verifies the Auth0 access token: signature (via JWKS), issuer, audience, expiry.
// On success, attaches the decoded claims to req.auth.payload. On failure, throws
// an error that our error handler turns into a 401.
export const authenticate = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
  tokenSigningAlg: "RS256",
});
