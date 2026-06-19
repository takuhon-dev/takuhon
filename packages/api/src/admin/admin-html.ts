/**
 * Inline HTML for the minimal admin editor served at `GET /admin`.
 *
 * Single-page, no build step: a token input, a JSON textarea, and
 * Load / Save (PUT) / Delete (DELETE) buttons. Nothing is loaded until the
 * owner enters the admin token and presses Load, which fetches the *full*
 * document from the authenticated `GET /api/admin/export` (the privacy filter
 * is bypassed there, so fields and links the public profile omits are editable
 * here and survive the next Save). The public `/takuhon.json` is deliberately
 * not used as the editor source: it is privacy-filtered, so loading from it
 * would silently drop non-public data the moment the owner saved.
 *
 * The page operates under a strict CSP (`script-src 'self' 'nonce-<n>'`,
 * `style-src 'self' 'nonce-<n>'`, `require-trusted-types-for 'script'`), so
 * both the inline `<script>` and `<style>` blocks carry the request-scoped
 * nonce. We avoid `innerHTML`/`eval` so Trusted Types is non-disruptive.
 */
export function renderAdminHtml(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>takuhon admin</title>
<style nonce="${nonce}">
body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #222; }
h1 { font-size: 1.5rem; }
p.note { color: #555; }
label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
input[type=password], textarea { width: 100%; box-sizing: border-box; padding: 0.5rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; border: 1px solid #999; border-radius: 4px; }
textarea { min-height: 24rem; }
.row { display: flex; gap: 0.5rem; margin-top: 1rem; }
button { padding: 0.5rem 1rem; font-size: 0.95rem; border: 1px solid #444; background: #fafafa; border-radius: 4px; cursor: pointer; }
button.danger { border-color: #b03; color: #b03; background: #fff5f5; }
#status { margin-top: 1rem; padding: 0.75rem; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
#status.ok { background: #e6f4ea; color: #1b5e20; border: 1px solid #82c891; }
#status.err { background: #fdecea; color: #b71c1c; border: 1px solid #ef9a9a; }
small.version { color: #555; }
</style>
</head>
<body>
<h1>takuhon admin</h1>
<p class="note">Enter your admin token, then <strong>Load</strong> to fetch the full <code>takuhon.json</code> document &mdash; including fields the public profile omits &mdash; for editing. <strong>Save</strong> writes it back; optimistic locking via <code>If-Match</code> guards concurrent edits. Nothing is loaded until you provide the token, and the token is never sent over the URL.</p>
<label for="token">Admin token</label>
<input id="token" type="password" autocomplete="off" spellcheck="false">
<label for="payload">takuhon.json <small class="version" id="versionLabel"></small></label>
<textarea id="payload" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
<div class="row">
  <button id="reload" type="button">Load current</button>
  <button id="save" type="button">Save</button>
  <button id="delete" type="button" class="danger">Delete profile</button>
</div>
<div id="status" hidden></div>
<script nonce="${nonce}">
(function () {
  var tokenEl = document.getElementById('token');
  var payloadEl = document.getElementById('payload');
  var versionEl = document.getElementById('versionLabel');
  var statusEl = document.getElementById('status');
  var ifMatch = '';

  function setStatus(message, ok) {
    statusEl.textContent = message;
    statusEl.className = ok ? 'ok' : 'err';
    statusEl.hidden = false;
  }
  function setVersion(etag) {
    ifMatch = etag || '';
    versionEl.textContent = ifMatch ? '(current version: ' + ifMatch + ')' : '(no stored version)';
  }
  function getToken() {
    var t = tokenEl.value.trim();
    if (!t) { setStatus('Admin token is required.', false); return null; }
    return t;
  }
  async function loadCurrent() {
    var token = getToken();
    if (!token) return;
    try {
      // The authenticated full export, NOT the public /takuhon.json: the latter
      // is privacy-filtered, so editing it would drop non-public data on Save.
      var res = await fetch('/api/admin/export', {
        cache: 'no-store',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.status === 404) {
        // No profile stored yet. Start from an empty editor; Save creates it.
        setVersion('');
        payloadEl.value = '';
        setStatus('No profile stored yet. Paste a takuhon.json document and Save to create it.', true);
        return;
      }
      if (!res.ok) {
        var err = await res.json().catch(function () { return null; });
        setStatus('Failed to load profile (' + res.status + '): ' + (err ? JSON.stringify(err, null, 2) : 'check the admin token'), false);
        return;
      }
      setVersion(res.headers.get('etag'));
      var json = await res.json();
      payloadEl.value = JSON.stringify(json, null, 2);
      setStatus('Loaded the full profile for editing.', true);
    } catch (e) {
      setStatus('Network error loading profile: ' + (e && e.message ? e.message : String(e)), false);
    }
  }
  async function save() {
    var token = getToken();
    if (!token) return;
    var body;
    try {
      body = JSON.parse(payloadEl.value);
    } catch (e) {
      setStatus('JSON parse error: ' + (e && e.message ? e.message : String(e)), false);
      return;
    }
    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
    if (ifMatch) headers['If-Match'] = ifMatch;
    try {
      var res = await fetch('/api/admin/profile', { method: 'PUT', headers: headers, body: JSON.stringify(body) });
      var json = await res.json().catch(function () { return null; });
      if (res.ok && json && json.meta && json.meta.version) {
        setVersion('"' + json.meta.version + '"');
        setStatus('Saved. New version: ' + json.meta.version, true);
      } else {
        setStatus('Save failed (' + res.status + '): ' + (json ? JSON.stringify(json, null, 2) : 'no body'), false);
      }
    } catch (e) {
      setStatus('Network error during save: ' + (e && e.message ? e.message : String(e)), false);
    }
  }
  async function deleteProfile() {
    var token = getToken();
    if (!token) return;
    if (!confirm('Delete the profile? The bundled onboarding fixture will be shown until you save a new document.')) return;
    var headers = { 'Authorization': 'Bearer ' + token };
    try {
      var res = await fetch('/api/admin/profile', { method: 'DELETE', headers: headers });
      if (res.ok) {
        payloadEl.value = '';
        setVersion('');
        setStatus('Deleted.', true);
      } else {
        var json = await res.json().catch(function () { return null; });
        setStatus('Delete failed (' + res.status + '): ' + (json ? JSON.stringify(json, null, 2) : 'no body'), false);
      }
    } catch (e) {
      setStatus('Network error during delete: ' + (e && e.message ? e.message : String(e)), false);
    }
  }

  document.getElementById('save').addEventListener('click', save);
  document.getElementById('delete').addEventListener('click', deleteProfile);
  document.getElementById('reload').addEventListener('click', loadCurrent);
  // No auto-load: the editor stays empty until the owner enters the admin token
  // and presses Load. Nothing about the profile is fetched without the token.
})();
</script>
</body>
</html>
`;
}
