import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { inTransaction } from '../db.js';
import { fixtureIds as id, seedFoundation } from '../fixtures/foundation.js';
import { createTestDatabase } from './helpers/database.js';
import { createInvitationService } from '../auth/invitations.js';
import { AuthenticationError } from '../auth/provider.js';

describe('single-use onboarding with a synthetic verified provider', () => {
  let database, pool;
  const managerId = '10000000-0000-4000-8000-000000000004';
  const ownerSubject = 'a0000000-0000-4000-8000-000000000001';
  const managerSubject = 'a0000000-0000-4000-8000-000000000004';
  before(async () => {
    database = await createTestDatabase(); pool = database.pool;
    await inTransaction(pool, seedFoundation);
    for (const userId of [id.ownerA, id.ownerB, id.tenantUser]) {
      await pool.query('UPDATE plazahub.users SET provider_subject = $1 WHERE id = $2', [userId === id.ownerA ? ownerSubject : randomUUID(), userId]);
    }
    await pool.query("INSERT INTO plazahub.users (id, provider_subject, display_name) VALUES ($1, $2, 'DEMO Manager')", [managerId, managerSubject]);
    await pool.query("INSERT INTO plazahub.plaza_memberships (plaza_id, user_id, role) VALUES ($1, $2, 'manager')", [id.plazaA, managerId]);
  });
  after(async () => { await database?.close(); });

  function setup() {
    let now = Date.UTC(2026, 10, 4, 12);
    const email = `invite-${randomBytes(8).toString('hex')}@example.test`;
    const state = { email, subject:randomUUID(), logouts:0, denied:false, logoutOutage:false };
    const provider = {
      async password() {
        if (state.denied) throw new AuthenticationError();
        return { subject:state.subject, email:state.email, accessToken:'SYNTHETIC_INVITE_ACCESS',
          refreshToken:'SYNTHETIC_INVITE_REFRESH', expiresAt:now + 3600_000 };
      },
      async logout() { state.logouts++; if (state.logoutOutage) throw new AuthenticationError('AUTH_UNAVAILABLE'); },
    };
    const create = () => createInvitationService({ pool, provider, clock:() => now });
    const request = { actorId:id.ownerA, plazaId:id.plazaA, kind:'tenant', tenantId:id.tenantA, email };
    const credentials = token => ({ token, email, password:'SYNTHETIC_INVITE_PASSWORD', displayName:'DEMO Invited Person' });
    return { service:create(), create, request, credentials, state, advance:ms => { now += ms; } };
  }
  const record = async invitation => (await pool.query('SELECT * FROM plazahub.invitations WHERE id = $1', [invitation.id])).rows[0];
  const events = async invitation => (await pool.query('SELECT action FROM plazahub.invitation_events WHERE invitation_id = $1 ORDER BY id', [invitation.id])).rows.map(row => row.action);
  const userCount = async subject => (await pool.query('SELECT count(*) AS n FROM plazahub.users WHERE provider_subject = $1', [subject])).rows[0].n;

  test('issuance saves only a scoped token hash and immutable issue event', async () => {
    const ctx = setup(), result = await ctx.service.issue({ ...ctx.request, email:` ${ctx.request.email.toUpperCase()} ` });
    const row = await record(result.invitation);
    assert.equal(row.email, ctx.request.email);
    assert.equal(row.token_hash.length, 64);
    assert.equal(row.token_hash.includes(result.token), false);
    assert.equal(JSON.stringify(row).includes(result.token), false);
    assert.equal(JSON.stringify(result.invitation).includes('token'), false);
    assert.deepEqual(await events(result.invitation), ['issued']);
  });

  test('tenant invitation grants only the saved business and never a management membership', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    ctx.state.logoutOutage = true;
    const result = await ctx.service.accept({ ...ctx.credentials(invitation.token), role:'owner', plazaId:id.plazaB, tenantId:id.tenantB });
    assert.equal(result.plazaId, id.plazaA); assert.equal(result.tenantId, id.tenantA);
    const links = await pool.query('SELECT plaza_id, tenant_id FROM plazahub.tenant_access WHERE user_id = $1', [result.userId]);
    assert.deepEqual(links.rows, [{ plaza_id:id.plazaA, tenant_id:id.tenantA }]);
    assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.plaza_memberships WHERE user_id = $1', [result.userId])).rows[0].n, '0');
    assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.sessions')).rows[0].n, '0', 'onboarding must not silently sign in');
    assert.deepEqual(await events(invitation.invitation), ['issued', 'accepted']);
    assert.equal(ctx.state.logouts, 1);
  });

  test('possession without the matching provider-verified email grants nothing', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    ctx.state.email = 'different@example.test';
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.equal(await userCount(ctx.state.subject), '0');
    assert.equal((await record(invitation.invitation)).status, 'pending');
    ctx.state.email = ctx.request.email;
    assert.ok(await ctx.service.accept(ctx.credentials(invitation.token)));
  });

  test('provider credential failure leaves the invitation and account data intact', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    ctx.state.denied = true;
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'AUTHENTICATION_FAILED' });
    assert.equal(await userCount(ctx.state.subject), '0');
    assert.deepEqual(await events(invitation.invitation), ['issued']);
  });

  test('consumed tokens cannot be replayed', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    await ctx.service.accept(ctx.credentials(invitation.token));
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.equal(await userCount(ctx.state.subject), '1');
    assert.deepEqual(await events(invitation.invitation), ['issued', 'accepted']);
  });

  test('exact expiry is persisted and reissue cannot revive the old token', async () => {
    const ctx = setup(), invitation = await ctx.service.issue({ ...ctx.request, lifetimeHours:1 });
    ctx.advance(3600_000);
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.equal((await record(invitation.invitation)).status, 'expired');
    assert.deepEqual(await events(invitation.invitation), ['issued', 'expired']);
    const replacement = await ctx.service.issue(ctx.request);
    assert.notEqual(replacement.invitation.id, invitation.invitation.id);
    assert.notEqual(replacement.token, invitation.token);
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.ok(await ctx.service.accept(ctx.credentials(replacement.token)));
  });

  test('duplicate issuance is rejected and lazily expired pending records can be replaced', async () => {
    const ctx = setup(), invitation = await ctx.service.issue({ ...ctx.request, lifetimeHours:1 });
    await assert.rejects(ctx.service.issue({ ...ctx.request, email:ctx.request.email.toUpperCase() }), { code:'INVITATION_CONFLICT' });
    ctx.advance(3600_000);
    const replacement = await ctx.service.issue(ctx.request);
    assert.notEqual(replacement.invitation.id, invitation.invitation.id);
    assert.deepEqual(await events(invitation.invitation), ['issued', 'expired']);
  });

  test('revocation is repeatable and cannot revoke an already accepted access grant', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    const input = { actorId:id.ownerA, plazaId:id.plazaA, invitationId:invitation.invitation.id, reason:'Wrong recipient' };
    await ctx.service.revoke(input); await ctx.service.revoke(input);
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.deepEqual(await events(invitation.invitation), ['issued', 'revoked']);
    const replacement = await ctx.service.issue(ctx.request);
    await ctx.service.accept(ctx.credentials(replacement.token));
    await assert.rejects(ctx.service.revoke({ ...input, invitationId:replacement.invitation.id }), { code:'INVITATION_INVALID' });
    assert.equal((await record(replacement.invitation)).status, 'accepted');
  });

  test('another plaza owner and an ordinary tenant cannot issue or revoke these invitations', async () => {
    const ctx = setup();
    for (const actorId of [id.ownerB, id.tenantUser]) await assert.rejects(ctx.service.issue({ ...ctx.request, actorId }), { code:'INVITATION_FORBIDDEN' });
    const invitation = await ctx.service.issue(ctx.request);
    await assert.rejects(ctx.service.revoke({ actorId:id.ownerB, plazaId:id.plazaA, invitationId:invitation.invitation.id, reason:'Attempt' }), { code:'INVITATION_FORBIDDEN' });
    assert.equal((await record(invitation.invitation)).status, 'pending');
  });

  test('manager authority covers tenant invitations; only owners may invite managers', async () => {
    const ctx = setup();
    await assert.rejects(ctx.service.issue({ ...ctx.request, actorId:managerId, kind:'manager', tenantId:null }), { code:'INVITATION_FORBIDDEN' });
    const invitation = await ctx.service.issue({ ...ctx.request, actorId:managerId });
    assert.ok(await ctx.service.accept(ctx.credentials(invitation.token)));
    const staff = setup(), managerInvite = await staff.service.issue({ ...staff.request, kind:'manager', tenantId:null });
    const result = await staff.service.accept(staff.credentials(managerInvite.token));
    assert.equal((await pool.query('SELECT role FROM plazahub.plaza_memberships WHERE plaza_id = $1 AND user_id = $2', [id.plazaA, result.userId])).rows[0].role, 'manager');
  });

  test('issuer revocation and archived targets are rechecked at acceptance', async () => {
    const ctx = setup(), invitation = await ctx.service.issue({ ...ctx.request, actorId:managerId });
    try {
      await pool.query("UPDATE plazahub.plaza_memberships SET status = 'revoked' WHERE plaza_id = $1 AND user_id = $2", [id.plazaA, managerId]);
      await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    } finally { await pool.query("UPDATE plazahub.plaza_memberships SET status = 'active' WHERE plaza_id = $1 AND user_id = $2", [id.plazaA, managerId]); }
    try {
      await pool.query("UPDATE plazahub.users SET status = 'suspended' WHERE id = $1", [managerId]);
      await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    } finally { await pool.query("UPDATE plazahub.users SET status = 'active' WHERE id = $1", [managerId]); }
    try {
      await pool.query('UPDATE plazahub.tenant_profiles SET archived_at = now() WHERE id = $1', [id.tenantA]);
      await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    } finally { await pool.query('UPDATE plazahub.tenant_profiles SET archived_at = NULL WHERE id = $1', [id.tenantA]); }
    assert.equal(await userCount(ctx.state.subject), '0');
  });

  test('suspended plazas and suspended recipient accounts cannot receive a grant', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    try {
      await pool.query("UPDATE plazahub.plazas SET status = 'suspended' WHERE id = $1", [id.plazaA]);
      await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    } finally { await pool.query("UPDATE plazahub.plazas SET status = 'active' WHERE id = $1", [id.plazaA]); }
    await pool.query("INSERT INTO plazahub.users (provider_subject, display_name, status) VALUES ($1, 'DEMO Suspended', 'suspended')", [ctx.state.subject]);
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_INVALID' });
    assert.equal((await record(invitation.invitation)).status, 'pending');
  });

  test('an existing provider identity is reused across separately invited plazas', async () => {
    const ctx = setup(), a = await ctx.service.issue(ctx.request);
    const b = await ctx.service.issue({ ...ctx.request, actorId:id.ownerB, plazaId:id.plazaB, tenantId:id.tenantB });
    const first = await ctx.service.accept(ctx.credentials(a.token));
    const second = await ctx.service.accept(ctx.credentials(b.token));
    assert.equal(first.userId, second.userId); assert.equal(await userCount(ctx.state.subject), '1');
    assert.equal((await pool.query('SELECT count(*) AS n FROM plazahub.tenant_access WHERE user_id = $1', [first.userId])).rows[0].n, '2');
  });

  test('manager invitations cannot downgrade or reactivate an owner membership', async () => {
    const ctx = setup(), invitation = await ctx.service.issue({ ...ctx.request, kind:'manager', tenantId:null });
    ctx.state.subject = ownerSubject;
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_CONFLICT' });
    assert.equal((await pool.query('SELECT role FROM plazahub.plaza_memberships WHERE plaza_id = $1 AND user_id = $2', [id.plazaA, id.ownerA])).rows[0].role, 'owner');
    assert.equal((await record(invitation.invitation)).status, 'pending');
    const ownerBSubject = (await pool.query('SELECT provider_subject FROM plazahub.users WHERE id = $1', [id.ownerB])).rows[0].provider_subject;
    await pool.query("INSERT INTO plazahub.plaza_memberships (plaza_id, user_id, role, status) VALUES ($1, $2, 'owner', 'revoked')", [id.plazaA, id.ownerB]);
    ctx.state.subject = ownerBSubject;
    await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'INVITATION_CONFLICT' });
    assert.deepEqual((await pool.query('SELECT role, status FROM plazahub.plaza_memberships WHERE plaza_id = $1 AND user_id = $2', [id.plazaA, id.ownerB])).rows[0], { role:'owner', status:'revoked' });
  });

  test('a new explicit invitation may restore a revoked manager without rewriting identity', async () => {
    const ctx = setup(), invitation = await ctx.service.issue({ ...ctx.request, kind:'manager', tenantId:null });
    ctx.state.subject = managerSubject;
    try {
      await pool.query("UPDATE plazahub.plaza_memberships SET status = 'revoked' WHERE plaza_id = $1 AND user_id = $2", [id.plazaA, managerId]);
      const accepted = await ctx.service.accept(ctx.credentials(invitation.token));
      assert.equal(accepted.userId, managerId);
      assert.equal((await pool.query('SELECT display_name FROM plazahub.users WHERE id = $1', [managerId])).rows[0].display_name, 'DEMO Manager');
    } finally { await pool.query("UPDATE plazahub.plaza_memberships SET status = 'active' WHERE plaza_id = $1 AND user_id = $2", [id.plazaA, managerId]); }
  });

  test('concurrent issuers produce only one pending token for a target', async () => {
    const ctx = setup(), results = await Promise.allSettled([ctx.service.issue(ctx.request), ctx.create().issue(ctx.request)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'INVITATION_CONFLICT');
  });

  test('concurrent consumers produce one account link and one consumption event', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request), input = ctx.credentials(invitation.token);
    const results = await Promise.allSettled([ctx.service.accept(input), ctx.create().accept(input)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'INVITATION_INVALID');
    assert.equal(await userCount(ctx.state.subject), '1');
    assert.deepEqual(await events(invitation.invitation), ['issued', 'accepted']);
  });

  test('revocation racing acceptance has one consistent terminal state and grant', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    await Promise.allSettled([ctx.service.accept(ctx.credentials(invitation.token)), ctx.create().revoke({ actorId:id.ownerA, plazaId:id.plazaA, invitationId:invitation.invitation.id, reason:'Withdrawn' })]);
    const row = await record(invitation.invitation);
    assert.ok(['accepted', 'revoked'].includes(row.status));
    assert.equal(await userCount(ctx.state.subject), row.status === 'accepted' ? '1' : '0');
    assert.deepEqual(await events(invitation.invitation), ['issued', row.status]);
  });

  test('a failed audit insert rolls back account creation, access and token consumption', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request);
    await pool.query(`CREATE FUNCTION plazahub.test_reject_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'accepted' THEN RAISE EXCEPTION 'Synthetic audit failure' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER test_reject_acceptance BEFORE INSERT ON plazahub.invitation_events FOR EACH ROW EXECUTE FUNCTION plazahub.test_reject_acceptance();`);
    try {
      await assert.rejects(ctx.service.accept(ctx.credentials(invitation.token)), { code:'23514' });
      assert.equal(await userCount(ctx.state.subject), '0');
      assert.equal((await record(invitation.invitation)).status, 'pending');
      assert.deepEqual(await events(invitation.invitation), ['issued']);
    } finally { await pool.query('DROP TRIGGER test_reject_acceptance ON plazahub.invitation_events; DROP FUNCTION plazahub.test_reject_acceptance();'); }
  });

  test('invalid scope/lifetime/roles and cross-plaza tenant targets are rejected', async () => {
    const ctx = setup();
    for (const change of [{ kind:'owner' }, { kind:'platform_admin' }, { lifetimeHours:0 }, { lifetimeHours:169 },
      { email:'not-email' }, { email:'bad\0@example.test' }, { kind:'manager', tenantId:id.tenantA }]) {
      await assert.rejects(ctx.service.issue({ ...ctx.request, ...change }), { code:'INVITATION_INPUT_INVALID' });
    }
    await assert.rejects(ctx.service.issue({ ...ctx.request, tenantId:id.tenantB }), { code:'INVITATION_INPUT_INVALID' });
    const invitation = await ctx.service.issue(ctx.request);
    await assert.rejects(ctx.service.accept({ ...ctx.credentials(invitation.token), displayName:'Bad\0Name' }), { code:'INVITATION_INPUT_INVALID' });
    await assert.rejects(pool.query(`INSERT INTO plazahub.invitations (plaza_id, kind, tenant_id, email, token_hash, created_by, created_at, expires_at)
      VALUES ($1, 'tenant', $2, $3, $4, $5, now(), now() + interval '1 day')`, [id.plazaA, id.tenantB, ctx.request.email, randomBytes(32).toString('hex'), id.ownerA]), { code:'23503' });
  });

  test('invitation identities, terminal states and audit events cannot be rewritten', async () => {
    const ctx = setup(), invitation = await ctx.service.issue(ctx.request), inviteId = invitation.invitation.id;
    await assert.rejects(pool.query('UPDATE plazahub.invitations SET email = $2 WHERE id = $1', [inviteId, 'other@example.test']), { code:'23514' });
    await assert.rejects(pool.query('DELETE FROM plazahub.invitations WHERE id = $1', [inviteId]), { code:'23514' });
    await ctx.service.accept(ctx.credentials(invitation.token));
    await assert.rejects(pool.query("UPDATE plazahub.invitations SET status = 'pending', closed_at = NULL, closed_by = NULL, accepted_subject = NULL WHERE id = $1", [inviteId]), { code:'23514' });
    await assert.rejects(pool.query('DELETE FROM plazahub.invitation_events WHERE invitation_id = $1', [inviteId]), { code:'23514' });
    await assert.rejects(pool.query("UPDATE plazahub.invitation_events SET action = 'revoked' WHERE invitation_id = $1", [inviteId]), { code:'23514' });
    assert.doesNotMatch(JSON.stringify(await record(invitation.invitation)), /SYNTHETIC_INVITE_ACCESS|SYNTHETIC_INVITE_REFRESH|SYNTHETIC_INVITE_PASSWORD/);
  });
});
