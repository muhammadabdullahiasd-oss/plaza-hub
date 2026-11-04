// Synthetic records for local development and isolated database tests only.
// These are not Supabase identities, invitations or login credentials.
export const fixtureIds = Object.freeze({
  ownerA:'10000000-0000-4000-8000-000000000001',
  ownerB:'10000000-0000-4000-8000-000000000002',
  tenantUser:'10000000-0000-4000-8000-000000000003',
  plazaA:'20000000-0000-4000-8000-000000000001',
  plazaB:'20000000-0000-4000-8000-000000000002',
  unitA:'30000000-0000-4000-8000-000000000001',
  unitB:'30000000-0000-4000-8000-000000000002',
  vacantA:'30000000-0000-4000-8000-000000000003',
  tenantA:'40000000-0000-4000-8000-000000000001',
  tenantB:'40000000-0000-4000-8000-000000000002',
  tenancyA:'50000000-0000-4000-8000-000000000001',
});

export async function seedFoundation(client) {
  const id = fixtureIds;
  // Never silently merge sample records with someone's existing local data.
  for (const table of ['users', 'plazas', 'plaza_memberships', 'units', 'tenant_profiles', 'tenant_access', 'tenancies', 'tenancy_terms']) {
    const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM plazahub.${table}) AS present`);
    if (rows[0].present) throw new Error('Synthetic fixtures require an empty foundation schema. Existing records were preserved.');
  }
  for (const [user, name] of [[id.ownerA, 'DEMO Owner A'], [id.ownerB, 'DEMO Owner B'], [id.tenantUser, 'DEMO Tenant User']]) {
    await client.query('INSERT INTO plazahub.users (id, display_name) VALUES ($1, $2)', [user, name]);
  }
  for (const [plaza, owner, city, name] of [[id.plazaA, id.ownerA, 'Abuja', 'DEMO Wuse Plaza'], [id.plazaB, id.ownerB, 'Kano', 'DEMO Kano Plaza']]) {
    await client.query('INSERT INTO plazahub.plazas (id, name, city) VALUES ($1, $2, $3)', [plaza, name, city]);
    await client.query("INSERT INTO plazahub.plaza_memberships (plaza_id, user_id, role) VALUES ($1, $2, 'owner')", [plaza, owner]);
  }
  for (const [unit, plaza, number] of [[id.unitA, id.plazaA, 'A-01'], [id.unitB, id.plazaB, 'A-01'], [id.vacantA, id.plazaA, 'A-02']]) {
    await client.query('INSERT INTO plazahub.units (id, plaza_id, number) VALUES ($1, $2, $3)', [unit, plaza, number]);
  }
  for (const [tenant, plaza, name] of [[id.tenantA, id.plazaA, 'DEMO Amina'], [id.tenantB, id.plazaB, 'DEMO Musa']]) {
    await client.query('INSERT INTO plazahub.tenant_profiles (id, plaza_id, name, business_name) VALUES ($1, $2, $3, $4)', [tenant, plaza, name, `${name} Stores`]);
  }
  await client.query('INSERT INTO plazahub.tenant_access (plaza_id, tenant_id, user_id) VALUES ($1, $2, $3)', [id.plazaA, id.tenantA, id.tenantUser]);
  await client.query(`INSERT INTO plazahub.tenancies (id, plaza_id, unit_id, tenant_id, lease_start, lease_end)
    VALUES ($1, $2, $3, $4, '2026-01-01', '2026-12-31')`, [id.tenancyA, id.plazaA, id.unitA, id.tenantA]);
  await client.query(`INSERT INTO plazahub.tenancy_terms (plaza_id, tenancy_id, version, effective_on, annual_rent_kobo, recorded_by, reason)
    VALUES ($1, $2, 1, '2026-01-01', $3, $4, 'Synthetic initial terms')`, [id.plazaA, id.tenancyA, '48000000', id.ownerA]);
}
