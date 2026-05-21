/**
 * Inline HTML for the minimal admin editor served at `GET /admin`.
 *
 * Single-page, no build step: a token input, a JSON textarea preloaded from
 * `/takuhon.json`, Save (PUT) and Delete (DELETE) buttons. The page operates
 * under a strict CSP (`script-src 'self' 'nonce-<n>'`,
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
<p class="note">Edit the full <code>takuhon.json</code> document and Save. Optimistic locking via <code>If-Match</code> guards concurrent edits; the token is never sent over the URL.</p>
<label for="token">Admin token</label>
<input id="token" type="password" autocomplete="off" spellcheck="false">
<label for="payload">takuhon.json <small class="version" id="versionLabel"></small></label>
<textarea id="payload" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
<div class="row">
  <button id="save" type="button">Save</button>
  <button id="delete" type="button" class="danger">Delete profile</button>
  <button id="reload" type="button">Reload current</button>
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
    try {
      var res = await fetch('/takuhon.json', { cache: 'no-store' });
      if (!res.ok) { setStatus('Failed to load /takuhon.json: ' + res.status, false); return; }
      setVersion(res.headers.get('etag'));
      var json = await res.json();
      payloadEl.value = JSON.stringify(json, null, 2);
      setStatus('Loaded current profile.', true);
    } catch (e) {
      setStatus('Network error loading current profile: ' + (e && e.message ? e.message : String(e)), false);
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
  loadCurrent();
})();
</script>
</body>
</html>
`;
}
