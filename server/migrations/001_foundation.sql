-- Initial operational slice only. Financial, auth/session and file schemas
-- arrive with their services; no frontend demo balances are imported.
CREATE SCHEMA plazahub;
REVOKE ALL ON SCHEMA plazahub FROM PUBLIC;

CREATE TABLE plazahub.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_subject uuid UNIQUE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plazahub.plazas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  city text NOT NULL CHECK (length(btrim(city)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  business_timezone text NOT NULL DEFAULT 'Africa/Lagos' CHECK (business_timezone = 'Africa/Lagos'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A user's identity is separate from their roles in independent plazas.
-- Owner creation/last-owner protection belong to the authorized service.
CREATE TABLE plazahub.plaza_memberships (
  plaza_id uuid NOT NULL REFERENCES plazahub.plazas(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'manager')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plaza_id, user_id)
);
CREATE INDEX memberships_by_user ON plazahub.plaza_memberships (user_id, status);

CREATE TABLE plazahub.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id uuid NOT NULL REFERENCES plazahub.plazas(id) ON DELETE RESTRICT,
  number text NOT NULL CHECK (number = btrim(number) AND length(number) BETWEEN 1 AND 40),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaza_id, id)
);
-- Shop numbers can repeat in another plaza, never in the same plaza.
CREATE UNIQUE INDEX units_number_per_plaza ON plazahub.units (plaza_id, lower(number));

CREATE TABLE plazahub.tenant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id uuid NOT NULL REFERENCES plazahub.plazas(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  business_name text NOT NULL CHECK (length(btrim(business_name)) BETWEEN 1 AND 200),
  email text CHECK (length(email) <= 254),
  phone text CHECK (length(phone) <= 40),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaza_id, id)
);

-- Several individually revocable users may represent one tenant business.
CREATE TABLE plazahub.tenant_access (
  plaza_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plaza_id, tenant_id, user_id),
  FOREIGN KEY (plaza_id, tenant_id) REFERENCES plazahub.tenant_profiles(plaza_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenant_access_by_user ON plazahub.tenant_access (user_id, status, plaza_id);

CREATE TABLE plazahub.tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  lease_start date NOT NULL CHECK (isfinite(lease_start)),
  lease_end date NOT NULL CHECK (isfinite(lease_end) AND lease_end > lease_start),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  ended_on date CHECK (isfinite(ended_on)),
  end_reason text CHECK (length(btrim(end_reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plaza_id, id),
  FOREIGN KEY (plaza_id, unit_id) REFERENCES plazahub.units(plaza_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (plaza_id, tenant_id) REFERENCES plazahub.tenant_profiles(plaza_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'active' AND ended_on IS NULL AND end_reason IS NULL)
    OR (status = 'ended' AND ended_on IS NOT NULL AND ended_on >= lease_start AND end_reason IS NOT NULL)
    OR (status = 'cancelled' AND ended_on IS NOT NULL AND ended_on < lease_start AND end_reason IS NOT NULL))
);
-- Lease expiry does not release a shop. Explicit closure does.
CREATE UNIQUE INDEX one_active_tenancy_per_unit ON plazahub.tenancies (plaza_id, unit_id) WHERE status = 'active';
CREATE INDEX tenancies_by_tenant ON plazahub.tenancies (plaza_id, tenant_id, status);

CREATE TABLE plazahub.tenancy_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id uuid NOT NULL,
  tenancy_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  effective_on date NOT NULL CHECK (isfinite(effective_on)),
  annual_rent_kobo bigint NOT NULL CHECK (annual_rent_kobo > 0),
  recorded_by uuid NOT NULL REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plaza_id, tenancy_id) REFERENCES plazahub.tenancies(plaza_id, id) ON DELETE RESTRICT,
  UNIQUE (plaza_id, tenancy_id, version),
  UNIQUE (plaza_id, tenancy_id, effective_on)
);

CREATE FUNCTION plazahub.protect_tenancy_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tenancy history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF (NEW.id, NEW.plaza_id, NEW.unit_id, NEW.tenant_id, NEW.lease_start, NEW.lease_end, NEW.created_at)
    IS DISTINCT FROM (OLD.id, OLD.plaza_id, OLD.unit_id, OLD.tenant_id, OLD.lease_start, OLD.lease_end, OLD.created_at)
    OR OLD.status <> 'active' THEN
    RAISE EXCEPTION 'Retain tenancy identity and closed history; create a new agreement' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_tenancy_history BEFORE UPDATE OR DELETE ON plazahub.tenancies
  FOR EACH ROW EXECUTE FUNCTION plazahub.protect_tenancy_history();

CREATE FUNCTION plazahub.protect_term_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Term history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER protect_term_history BEFORE UPDATE OR DELETE ON plazahub.tenancy_terms
  FOR EACH ROW EXECUTE FUNCTION plazahub.protect_term_history();

-- Defence in depth preparation: no public privileges or usable policies.
-- Migration owner still bypasses RLS; Stage 13 tests a separate runtime role
-- and trusted request context before any business API can access these rows.
ALTER TABLE plazahub.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.plazas ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.plaza_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.tenant_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.tenancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.tenancy_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA plazahub FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA plazahub FROM PUBLIC;
