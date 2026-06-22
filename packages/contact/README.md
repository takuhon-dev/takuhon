# @takuhon/contact

Portable, framework-agnostic core for a lightweight contact form — input
validation, a stateless request pipeline, and the challenge/email transport
seams an adapter fills.

> **Status:** early skeleton (private, unpublished). Host wiring (e.g. Cloudflare
> Turnstile + `send_email`) lives in the adapters. This package carries no
> Cloudflare, Node, or framework dependency, so the same core runs anywhere.

## What this package is

- **`handleContact(request, deps)`** — a Web-standard `(Request) => Response`
  pipeline: method / content-type / origin guards, a size-bounded JSON parse,
  validation, challenge verification, then delivery via an `EmailTransport`. It
  is stateless: no database, no admin UI, no auto-reply.
- **`validateSubmission(raw, config)`** — strict, pure validation. The email
  rules reject any CR/LF and only accept a single address, so the value is safe
  to place in a `Reply-To` header (no email header injection). Length limits and
  a honeypot are enforced too.
- **`ChallengeVerifier` / `EmailTransport`** — the two interfaces an adapter
  implements (e.g. a Turnstile verifier and a `send_email` transport).

## Design

See the design notes for the full plan (dogfood on two sites, then publish for
reuse). The deliberate non-goals are realtime chat, storage, an admin UI, and
auto-replies to the visitor; the received inbox is the history.

## License

Apache-2.0 (see [LICENSE](./LICENSE) and [NOTICE](./NOTICE)).
