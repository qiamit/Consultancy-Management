// The QE sign-in + consent page shown when Claude starts the OAuth flow.

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export function renderLoginPage({ form, clientName, error = '', email = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to Consultancy Pro</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; background: #f5f5f4; color: #1c1917; }
  main { width: min(26rem, calc(100vw - 2rem)); background: #fff; border: 2px solid #57534e; box-shadow: 0 10px 30px rgb(0 0 0 / .08); }
  header { background: linear-gradient(135deg, #292524, #0c0a09); color: #fff; padding: 1rem 1.25rem; border-bottom: 2px solid #f59e0b; }
  header h1 { margin: 0; font-size: 1.05rem; letter-spacing: .02em; }
  header p { margin: .25rem 0 0; color: #fcd34d; font-size: .85rem; }
  form { padding: 1.25rem; display: grid; gap: .85rem; }
  label { display: grid; gap: .3rem; font-weight: 600; font-size: .85rem; }
  input { font: inherit; padding: .55rem .6rem; border: 1px solid #78716c; background: #fafaf9; }
  input:focus { outline: 2px solid #f59e0b; outline-offset: 0; background: #fff; }
  button { font: inherit; font-weight: 600; padding: .6rem; border: 0; background: #b45309; color: #fff; cursor: pointer; }
  button:hover { background: #92400e; }
  .note { font-size: .8rem; color: #57534e; margin: 0; }
  .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; padding: .5rem .6rem; font-size: .85rem; margin: 0; }
</style>
</head>
<body>
<main>
  <header>
    <h1>Q Engineering · Consultancy Pro</h1>
    <p>${esc(clientName)} wants to connect to your account</p>
  </header>
  <form method="post" action="/login" autocomplete="on">
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ''}
    <p class="note">Sign in with your Consultancy Pro account. ${esc(clientName)} will see and use only what your Module Access allows. You can disconnect it any time.</p>
    <input type="hidden" name="form" value="${esc(form)}">
    <label>Email<input name="email" type="email" required autocomplete="username" value="${esc(email)}"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <label>Authenticator Code (Only if Two-Step Login Is On)<input name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="6-Digit Code"></label>
    <button type="submit">Sign in and allow</button>
  </form>
</main>
</body>
</html>`
}
