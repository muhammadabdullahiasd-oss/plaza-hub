import { inTransaction } from '../db.js';
import { AuthenticationError } from './provider.js';
import { newSessionToken, validSessionToken, hashSessionToken, csrfForSession, matchesCsrf } from './crypto.js';

export const sessionLifetime = Object.freeze({ idleMs:30 * 60_000, absoluteMs:8 * 60 * 60_000 });

// Private service, not wired into CLI startup yet. Runtime credentials/policies
// and real-provider validation must precede enabling live HTTP authentication.
export function createSessionService({ pool, provider, tokenBox, clock = Date.now }) {
  const revoke = (client, hash, reason, now) => client.query(`UPDATE plazahub.sessions
    SET revoked_at = $2, revocation_reason = $3, encrypted_provider_tokens = NULL
    WHERE token_hash = $1 AND revoked_at IS NULL`, [hash, new Date(now), reason]);
  const dto = (row, rawToken) => ({ user:{ id:row.user_id, displayName:row.display_name },
    csrfToken:csrfForSession(rawToken), expiresAt:row.absolute_expires_at.toISOString() });

  async function discardProvider(tokens) {
    try { await provider.logout(tokens.accessToken); } catch { /* Local revocation must survive provider downtime. */ }
  }

  async function login({ email, password }, previousToken) {
    const tokens = await provider.password(email, password);
    let saved = false;
    try {
      const rawToken = newSessionToken(), hash = hashSessionToken(rawToken), now = clock();
      const result = await inTransaction(pool, async client => {
        // Link only an explicitly provisioned provider UUID. Names, email and
        // provider metadata cannot create PlazaHub users or grant roles.
        const { rows } = await client.query(`SELECT id, display_name FROM plazahub.users
          WHERE provider_subject = $1 AND status = 'active' FOR UPDATE`, [tokens.subject]);
        if (!rows.length) throw new AuthenticationError();
        const absolute = new Date(now + sessionLifetime.absoluteMs);
        await client.query(`INSERT INTO plazahub.sessions
          (token_hash, user_id, encrypted_provider_tokens, created_at, last_seen_at, idle_expires_at, absolute_expires_at)
          VALUES ($1, $2, $3, $4, $4, $5, $6)`, [hash, rows[0].id, tokenBox.seal(tokens, hash),
          new Date(now), new Date(now + sessionLifetime.idleMs), absolute]);
        if (validSessionToken(previousToken)) await revoke(client, hashSessionToken(previousToken), 'replaced', now);
        return { token:rawToken, data:dto({ user_id:rows[0].id, display_name:rows[0].display_name, absolute_expires_at:absolute }, rawToken) };
      });
      saved = true;
      return result;
    } finally { if (!saved) await discardProvider(tokens); }
  }

  async function current(rawToken) {
    if (!validSessionToken(rawToken)) return null;
    const hash = hashSessionToken(rawToken);
    return inTransaction(pool, async client => {
      // Shared PostgreSQL lock serializes refresh across processes/tabs. No
      // process-local mutex or shared provider SDK session is used.
      const { rows } = await client.query(`SELECT s.*, u.display_name, u.status AS user_status, u.provider_subject
        FROM plazahub.sessions s JOIN plazahub.users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.revoked_at IS NULL FOR UPDATE OF s`, [hash]);
      if (!rows.length) return null;
      const row = rows[0], now = clock();
      if (row.absolute_expires_at.getTime() <= now || row.idle_expires_at.getTime() <= now) {
        await revoke(client, hash, 'expired', now); return null;
      }
      if (row.user_status !== 'active' || !row.provider_subject) {
        await revoke(client, hash, 'account', now); return null;
      }
      let tokens;
      try {
        tokens = tokenBox.open(row.encrypted_provider_tokens, hash);
        if (!tokens || tokens.subject !== row.provider_subject || typeof tokens.accessToken !== 'string'
          || typeof tokens.refreshToken !== 'string' || !Number.isFinite(tokens.expiresAt)) throw new Error();
      } catch { await revoke(client, hash, 'unreadable', now); return null; }
      try {
        if (tokens.expiresAt <= now + 30_000) tokens = await provider.refresh(tokens.refreshToken);
        else {
          const user = await provider.getUser(tokens.accessToken);
          if (user.subject !== row.provider_subject) throw new AuthenticationError();
        }
        if (tokens.subject !== row.provider_subject) throw new AuthenticationError();
      } catch (error) {
        if (error instanceof AuthenticationError && error.code === 'AUTHENTICATION_FAILED') {
          await revoke(client, hash, 'provider', now); return null;
        }
        throw error; // Outage rolls back; no idle extension or mock success.
      }
      // Take the time again after provider I/O; a slow response cannot revive
      // an idle/absolute-expired session or grant a fresh lifetime from login.
      const finished = clock();
      if (row.absolute_expires_at.getTime() <= finished || row.idle_expires_at.getTime() <= finished) {
        await revoke(client, hash, 'expired', finished); return null;
      }
      await client.query(`UPDATE plazahub.sessions SET encrypted_provider_tokens = $2, last_seen_at = $3, idle_expires_at = $4
        WHERE token_hash = $1`, [hash, tokenBox.seal(tokens, hash), new Date(finished),
        new Date(Math.min(finished + sessionLifetime.idleMs, row.absolute_expires_at.getTime()))]);
      return dto(row, rawToken);
    });
  }

  async function logout(rawToken, csrfToken) {
    if (!matchesCsrf(rawToken, csrfToken)) throw new AuthenticationError('CSRF_FAILED');
    const hash = hashSessionToken(rawToken), now = clock();
    const tokens = await inTransaction(pool, async client => {
      const { rows } = await client.query('SELECT encrypted_provider_tokens FROM plazahub.sessions WHERE token_hash = $1 AND revoked_at IS NULL FOR UPDATE', [hash]);
      if (!rows.length) return null;
      let credentials;
      try { credentials = tokenBox.open(rows[0].encrypted_provider_tokens, hash); } catch { /* Still revoke unreadable sessions. */ }
      await revoke(client, hash, 'logout', now);
      return credentials;
    });
    // Persist local denial before optional upstream I/O. An upstream logout
    // failure cannot resurrect the cookie, nor imply global provider logout.
    if (tokens) await discardProvider(tokens);
  }

  return { login, current, logout };
}
