'use strict';
/* Supabase-Anbindung ohne Zusatzbibliothek (nur fetch):
   - Login per E-Mail und Passwort (Supabase Auth), Sitzung im localStorage, Token wird vor Ablauf erneuert
   - REST-Zugriff auf die nut_*-Tabellen; Row Level Security prüft Freigabeliste und Besitzer */

class LoginNeeded extends Error {
  constructor(msg = 'Bitte anmelden') { super(msg); this.name = 'LoginNeeded'; }
}

const Cloud = (() => {
  const cfg = window.APP_CONFIG || {};
  const url = (cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = cfg.supabaseKey || '';
  const SESSION = 'nut.session';
  let session = null;  // { access_token, refresh_token, expires_at (Sekunden), email }
  try { session = JSON.parse(localStorage.getItem(SESSION)); } catch { /* kein Speicher */ }
  let refreshing = null;

  let member = null;  // Ergebnis von nut_is_member, einmal je Sitzung abgefragt

  function setSession(s) {
    session = s;
    member = null;
    try { s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION); } catch { /* egal */ }
  }

  function fromAuth(j) {
    return { access_token: j.access_token, refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: j.user?.email || '' };
  }

  // Antwortet der Server mit einem Fehler, ist e.status gesetzt; Netzfehler (offline) haben keinen Status
  async function auth(path, body) {
    const r = await fetch(`${url}/auth/v1/${path}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw Object.assign(new Error(j.error_description || j.msg || j.message || `Anmeldung fehlgeschlagen (${r.status})`),
        { status: r.status });
    }
    return j;
  }

  async function signIn(email, password) {
    setSession(fromAuth(await auth('token?grant_type=password', { email: email.trim().toLowerCase(), password })));
  }

  async function signOut() {
    const s = session;
    setSession(null);
    if (s) await fetch(`${url}/auth/v1/logout`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
  }

  // Gültiges Zugriffstoken; erneuert eine Minute vor Ablauf (parallele Aufrufe teilen sich die Erneuerung).
  // Abgemeldet wird nur, wenn der Server das Refresh-Token ablehnt – nicht bei Netzfehlern (offline).
  async function token() {
    if (!session) throw new LoginNeeded();
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    refreshing ??= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(j => setSession(fromAuth(j)))
      .catch(e => {
        if (!e.status) throw new Error('Keine Verbindung – bitte später erneut versuchen');
        setSession(null);
        throw new LoginNeeded(`Sitzung abgelaufen: ${e.message}`);
      })
      .finally(() => { refreshing = null; });
    await refreshing;
    return session.access_token;
  }

  async function rest(path, { method = 'GET', body, prefer } = {}) {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.status === 401) { setSession(null); throw new LoginNeeded('Sitzung ungültig, bitte neu anmelden'); }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || `Serverfehler ${r.status}`);
    }
    return r.status === 204 || prefer?.includes('return=minimal') ? null : r.json();
  }

  return {
    configured: !!url && !!key,
    get email() { return session?.email || ''; },
    get loggedIn() { return !!session; },
    signIn, signOut, rest,
    isMember: async () => (member ??= await rest('rpc/nut_is_member', { method: 'POST', body: {} })),
  };
})();
