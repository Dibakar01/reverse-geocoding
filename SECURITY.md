# Security

## Reporting

Report vulnerabilities through
[GitHub's private advisory form](../../security/advisories/new), or by email to
the address on the repository owner's profile. Please do not open a public issue
for anything exploitable.

## What this service handles

Worth stating plainly, because it narrows the surface a lot:

- **No authentication, no accounts, no database, no secrets.** There is no
  credential to leak; the repo holds no keys and needs none.
- **No outbound network calls at runtime.** The extract is read from disk at
  startup. Nothing is sent anywhere, and coordinates never leave the process.
- **Input is two numbers**, validated for range and finiteness before use.
- **The disk cache is only ever a cache.** An unreadable or unwritable file is
  logged and ignored rather than being fatal.

## Things worth knowing before you deploy it

- **CORS is `*`.** The endpoint is read-only and costs nothing per call, so this
  is deliberate — but once it has a public URL, anyone can query it. Restrict the
  origin in `send()` in `server.js` if that matters to you.
- **There is no rate limiting.** Put a reverse proxy in front if you expose it to
  the open internet.
- **Coordinates are personal data in many jurisdictions.** Nothing is logged by
  default beyond the startup line; keep it that way if you add logging.
