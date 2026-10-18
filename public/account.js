// Account button + login/signup modal. Add to index.html before </body>:
//   <script src="/account.js" defer></script>
// The button goes inside any element with data-account, or floats bottom-left if there is none.
// Other scripts can read window.SkellyAccount.user and listen for the 'skelly:account' event.
(() => {
  const API = '/api/account';
  const S = window.SkellyAccount = { user: null };

  const css = `
  .sva-btn{font:inherit;font-size:12px;letter-spacing:.15em;text-transform:uppercase;padding:8px 14px;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;cursor:pointer;transition:background .2s,color .2s}
  .sva-btn:hover{background:rgba(255,255,255,.12)}
  .sva-float{position:fixed;left:16px;bottom:16px;z-index:9998;color:#fff;background:rgba(0,0,0,.55);backdrop-filter:blur(8px)}
  .sva-back{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);opacity:0;transition:opacity .2s}
  .sva-back.on{opacity:1}
  .sva-box{width:100%;max-width:360px;background:#0b0b0f;color:#f2f2f2;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:22px;font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .sva-tabs{display:flex;gap:6px;margin-bottom:16px}
  .sva-tab{flex:1;padding:8px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:none;color:inherit;font:inherit;font-size:12px;letter-spacing:.15em;cursor:pointer;opacity:.55}
  .sva-tab.on{opacity:1;background:rgba(255,255,255,.1)}
  .sva-box label{display:block;font-size:11px;letter-spacing:.15em;opacity:.7;margin:10px 0 4px}
  .sva-box input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:15px}
  .sva-box input:focus{outline:none;border-color:rgba(255,255,255,.6)}
  .sva-go{width:100%;margin-top:16px;padding:11px;border:0;border-radius:8px;background:#f2f2f2;color:#0b0b0f;font:inherit;font-weight:700;letter-spacing:.15em;cursor:pointer}
  .sva-go:disabled{opacity:.5;cursor:default}
  .sva-err{color:#ff6b7a;font-size:13px;min-height:18px;margin-top:10px;letter-spacing:normal}
  .sva-me{font-size:14px;line-height:1.6}
  .sva-me b{letter-spacing:.1em}
  .sva-x{float:right;background:none;border:0;color:inherit;font-size:20px;cursor:pointer;opacity:.6;margin:-8px -6px 0 0}`;

  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function call(path, body) {
    const r = await fetch(API + path, body === undefined
      ? { credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  let btn;
  function setUser(u) {
    S.user = u;
    if (btn) btn.textContent = u ? u.username : 'LOG IN';
    document.dispatchEvent(new CustomEvent('skelly:account', { detail: u }));
  }

  function modal(start) {
    const back = el(`<div class="sva-back" role="dialog" aria-modal="true"><div class="sva-box"></div></div>`);
    const box = back.firstChild;
    const close = () => { back.classList.remove('on'); setTimeout(() => back.remove(), 200); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);

    function render(mode) {
      if (S.user) {
        const joined = new Date(S.user.created).toLocaleDateString();
        box.innerHTML = `<button class="sva-x" aria-label="Close">×</button>
          <div class="sva-me">Logged in as <b>${esc(S.user.username)}</b><br>${esc(S.user.email)}<br><span style="opacity:.6">Joined ${joined}</span></div>
          <button class="sva-go" data-out>LOG OUT</button>`;
        box.querySelector('[data-out]').onclick = async () => { await call('/logout', {}).catch(() => {}); setUser(null); close(); };
      } else {
        const up = mode === 'signup';
        box.innerHTML = `<button class="sva-x" aria-label="Close">×</button>
          <div class="sva-tabs"><button class="sva-tab ${up ? '' : 'on'}" data-m="login">LOG IN</button><button class="sva-tab ${up ? 'on' : ''}" data-m="signup">SIGN UP</button></div>
          <form novalidate>
            ${up ? `<label>EMAIL</label><input name="email" type="email" autocomplete="email" required>
                    <label>USERNAME</label><input name="username" autocomplete="username" maxlength="20" required>`
                 : `<label>EMAIL OR USERNAME</label><input name="login" autocomplete="username" required>`}
            <label>PASSWORD</label><input name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required>
            <button class="sva-go" type="submit">${up ? 'CREATE ACCOUNT' : 'LOG IN'}</button>
            <div class="sva-err"></div>
          </form>`;
        box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => render(b.dataset.m));
        const form = box.querySelector('form'), err = box.querySelector('.sva-err'), go = box.querySelector('.sva-go');
        form.onsubmit = async e => {
          e.preventDefault();
          err.textContent = ''; go.disabled = true;
          try {
            const { user } = await call(up ? '/signup' : '/login', Object.fromEntries(new FormData(form)));
            setUser(user); close();
          } catch (x) { err.textContent = x.message; go.disabled = false; }
        };
        setTimeout(() => form.querySelector('input').focus(), 50);
      }
      box.querySelector('.sva-x').onclick = close;
    }

    render(start);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('on'));
  }

  S.open = (mode = 'login') => modal(mode);
  S.logout = async () => { await call('/logout', {}); setUser(null); };

  function init() {
    document.head.appendChild(el(`<style>${css}</style>`));
    const slot = document.querySelector('[data-account]');
    btn = el(`<button class="sva-btn ${slot ? '' : 'sva-float'}" type="button">LOG IN</button>`);
    btn.onclick = () => modal('login');
    (slot || document.body).appendChild(btn);
    call('/me').then(d => setUser(d.user)).catch(() => {});
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
