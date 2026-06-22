# Widget preview

A local harness for clicking through the contact widget before it is wired into
a real site. The submit endpoint is stubbed (always succeeds) and Turnstile uses
the public test sitekey, so no backend or account is needed.

```sh
# 1. Build the widget asset (produces ../dist/contact-widget.js + .css)
pnpm --filter @takuhon/contact build

# 2. Serve this package over HTTP (Turnstile needs http(s), not file://)
#    from packages/contact, then open the preview:
python3 -m http.server 8787   # or: npx serve .
#    → http://localhost:8787/preview/index.html
```

Append `?lang=en` to preview the English copy. This directory is dev-only and is
not part of the published package (`files` ships `dist` only).
