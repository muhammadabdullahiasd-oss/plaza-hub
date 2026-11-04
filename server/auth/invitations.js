import { createHash } from 'node:crypto';
import { inTransaction } from '../db.js';
import { newSessionToken as newInvitationToken, validSessionToken as validInvitationToken } from './crypto.js';
import { AuthenticationError, normalizeEmail } from './provider.js';

export class InvitationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new InvitationError(code); };
const uuid = value => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const hashToken = token => createHash('sha256').update(`plazahub:invitation:v1:${token}`).digest('hex');
const hour = 3600_000;

// Private server service. actorId must come from a validated session when HTTP
// composition is implemented; it is never a public form's authority claim.
export function createInvitationService({ pool, provider, clock = Date.now }) {
  async function lockPlaza(client, plazaId) {
    const { rows } = await client.query('SELECT status FROM plazahub.plazas WHERE id = $1 FOR UPDATE', [plazaId]);
    return rows[0]?.status === 'active';
  }
  async function allowed(client, actorId, plazaId, kind) {
    const { rows } = await client.query(`SELECT m.role FROM plazahub.plaza_memberships m
      JOIN plazahub.users u ON u.id = m.user_id WHERE m.plaza_id = $1 AND m.user_id = $2
      AND m.status = 'active' AND u.status = 'active' AND u.provider_subject IS NOT NULL FOR SHARE OF m, u`, [plazaId, actorId]);
    return rows[0]?.role === 'owner' || (kind === 'tenant' && rows[0]?.role === 'manager');
  }
  async function targetActive(client, plazaId, kind, tenantId) {
    if (kind === 'manager') return true;
    const { rowCount } = await client.query('SELECT 1 FROM plazahub.tenant_profiles WHERE plaza_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE', [plazaId, tenantId]);
    return !!rowCount;
  }
  const event = (client, row, action, actor, now) => client.query(`INSERT INTO plazahub.invitation_events
    (plaza_id, invitation_id, action, actor_id, occurred_at) VALUES ($1, $2, $3, $4, $5)`, [row.plaza_id, row.id, action, actor, new Date(now)]);
  async function expire(client, row, now) {
    if (row.status !== 'pending' || row.expires_at.getTime() > now) return false;
    await client.query("UPDATE plazahub.invitations SET status = 'expired', closed_at = $2 WHERE id = $1", [row.id, new Date(now)]);
    await event(client, row, 'expired', null, now);
    return true;
  }
  const dto = row => ({ id:row.id, plazaId:row.plaza_id, kind:row.kind, tenantId:row.tenant_id,
    email:row.email, status:row.status, expiresAt:row.expires_at.toISOString() });

  async function issue({ actorId, plazaId, kind, tenantId = null, email, lifetimeHours = 24 }) {
    const normalized = normalizeEmail(email);
    if (!uuid(actorId) || !uuid(plazaId) || !['manager', 'tenant'].includes(kind) || !normalized
      || (kind === 'tenant' ? !uuid(tenantId) : tenantId !== null)
      || !Number.isInteger(lifetimeHours) || lifetimeHours < 1 || lifetimeHours > 168) fail('INVITATION_INPUT_INVALID');
    return inTransaction(pool, async client => {
      // One consistent per-plaza lock order covers issue/revoke/accept races.
      if (!await lockPlaza(client, plazaId) || !await allowed(client, actorId, plazaId, kind)) fail('INVITATION_FORBIDDEN');
      if (!await targetActive(client, plazaId, kind, tenantId)) fail('INVITATION_INPUT_INVALID');
      const now = clock();
      const { rows:existing } = await client.query(`SELECT * FROM plazahub.invitations
        WHERE plaza_id = $1 AND kind = $2 AND tenant_id IS NOT DISTINCT FROM $3 AND email = $4 AND status = 'pending' FOR UPDATE`, [plazaId, kind, tenantId, normalized]);
      for (const row of existing) if (!await expire(client, row, now)) fail('INVITATION_CONFLICT');
      const token = newInvitationToken();
      const { rows } = await client.query(`INSERT INTO plazahub.invitations
        (plaza_id, kind, tenant_id, email, token_hash, created_by, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [plazaId, kind, tenantId, normalized, hashToken(token), actorId, new Date(now), new Date(now + lifetimeHours * hour)]);
      await event(client, rows[0], 'issued', actorId, now);
      // One-time secret goes only to the trusted delivery caller. Never log it,
      // store a raw URL, or include it in later administrative list responses.
      return { invitation:dto(rows[0]), token };
    });
  }

  async function revoke({ actorId, plazaId, invitationId, reason }) {
    if (!uuid(actorId) || !uuid(plazaId) || !uuid(invitationId) || typeof reason !== 'string'
      || !reason.trim() || reason.trim().length > 500 || reason.includes('\0')) fail('INVITATION_INPUT_INVALID');
    const result = await inTransaction(pool, async client => {
      if (!await lockPlaza(client, plazaId)) fail('INVITATION_FORBIDDEN');
      const { rows } = await client.query('SELECT * FROM plazahub.invitations WHERE plaza_id = $1 AND id = $2 FOR UPDATE', [plazaId, invitationId]);
      const row = rows[0];
      if (!row || !await allowed(client, actorId, plazaId, row.kind)) fail('INVITATION_FORBIDDEN');
      if (row.status === 'revoked') return dto(row);
      const now = clock();
      if (await expire(client, row, now) || row.status !== 'pending') return null;
      const changed = await client.query(`UPDATE plazahub.invitations SET status = 'revoked', closed_at = $2, closed_by = $3, close_reason = $4
        WHERE id = $1 RETURNING *`, [row.id, new Date(now), actorId, reason.trim()]);
      await event(client, row, 'revoked', actorId, now);
      return dto(changed.rows[0]);
    });
    if (!result) fail('INVITATION_INVALID');
    return result;
  }

  async function accept({ token, email, password, displayName }) {
    if (!validInvitationToken(token) || !normalizeEmail(email) || typeof password !== 'string' || !password.length || password.length > 1024
      || typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 160
      || /[\u0000-\u001f\u007f]/.test(displayName)) fail('INVITATION_INPUT_INVALID');
    // Only the provider's verified email is compared with the invitation.
    // The request's email, claimed role and profile fields cannot establish it.
    const grant = await provider.password(normalizeEmail(email), password);
    try {
      if (!uuid(grant.subject) || !normalizeEmail(grant.email) || !Number.isFinite(grant.expiresAt)) throw new AuthenticationError();
      const result = await inTransaction(pool, async client => {
        const { rows:lookup } = await client.query('SELECT plaza_id FROM plazahub.invitations WHERE token_hash = $1', [hashToken(token)]);
        if (!lookup.length || !await lockPlaza(client, lookup[0].plaza_id)) return null;
        const { rows } = await client.query('SELECT * FROM plazahub.invitations WHERE token_hash = $1 FOR UPDATE', [hashToken(token)]);
        const row = rows[0], now = clock();
        if (!row || row.status !== 'pending' || await expire(client, row, now)) return null;
        if (grant.expiresAt <= now) throw new AuthenticationError();
        if (normalizeEmail(grant.email) !== row.email || !await allowed(client, row.created_by, row.plaza_id, row.kind)
          || !await targetActive(client, row.plaza_id, row.kind, row.tenant_id)) return null;
        await client.query(`INSERT INTO plazahub.users (provider_subject, display_name) VALUES ($1, $2)
          ON CONFLICT (provider_subject) DO NOTHING`, [grant.subject, displayName.trim()]);
        const { rows:users } = await client.query('SELECT id, status FROM plazahub.users WHERE provider_subject = $1 FOR SHARE', [grant.subject]);
        if (users[0].status !== 'active') fail('INVITATION_INVALID');
        const userId = users[0].id;
        let granted;
        if (row.kind === 'manager') {
          granted = await client.query(`INSERT INTO plazahub.plaza_memberships (plaza_id, user_id, role) VALUES ($1, $2, 'manager')
            ON CONFLICT (plaza_id, user_id) DO UPDATE SET status = 'active'
            WHERE plaza_memberships.role = 'manager' AND plaza_memberships.status = 'revoked' RETURNING user_id`, [row.plaza_id, userId]);
        } else {
          granted = await client.query(`INSERT INTO plazahub.tenant_access (plaza_id, tenant_id, user_id) VALUES ($1, $2, $3)
            ON CONFLICT (plaza_id, tenant_id, user_id) DO UPDATE SET status = 'active'
            WHERE tenant_access.status = 'revoked' RETURNING user_id`, [row.plaza_id, row.tenant_id, userId]);
        }
        // A manager invitation must never downgrade/reactivate an owner.
        if (!granted.rowCount) fail('INVITATION_CONFLICT');
        await client.query(`UPDATE plazahub.invitations SET status = 'accepted', closed_at = $2, closed_by = $3, accepted_subject = $4
          WHERE id = $1`, [row.id, new Date(now), userId, grant.subject]);
        await event(client, row, 'accepted', userId, now);
        return { userId, plazaId:row.plaza_id, kind:row.kind, tenantId:row.tenant_id };
      });
      // Throw after commit so a server-observed expiration event is retained.
      if (!result) fail('INVITATION_INVALID');
      return result;
    } finally {
      try { await provider.logout(grant.accessToken); } catch { /* No application session was created. */ }
    }
  }

  return { issue, revoke, accept };
}
