CREATE TABLE plazahub.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_id uuid NOT NULL REFERENCES plazahub.plazas(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('manager', 'tenant')),
  tenant_id uuid,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  closed_at timestamptz,
  closed_by uuid REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  close_reason text CHECK (length(btrim(close_reason)) BETWEEN 1 AND 500),
  accepted_subject uuid,
  UNIQUE (plaza_id, id),
  FOREIGN KEY (plaza_id, created_by) REFERENCES plazahub.plaza_memberships(plaza_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (plaza_id, tenant_id) REFERENCES plazahub.tenant_profiles(plaza_id, id) ON DELETE RESTRICT,
  CHECK ((kind = 'manager' AND tenant_id IS NULL) OR (kind = 'tenant' AND tenant_id IS NOT NULL)),
  CHECK ((status = 'pending' AND closed_at IS NULL AND closed_by IS NULL AND close_reason IS NULL AND accepted_subject IS NULL)
    OR (status = 'accepted' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NULL AND accepted_subject IS NOT NULL)
    OR (status = 'revoked' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND close_reason IS NOT NULL AND accepted_subject IS NULL)
    OR (status = 'expired' AND closed_at IS NOT NULL AND closed_by IS NULL AND close_reason IS NULL AND accepted_subject IS NULL)),
  CHECK (closed_at IS NULL OR closed_at >= created_at),
  CHECK (status <> 'accepted' OR closed_at < expires_at),
  CHECK (status <> 'expired' OR closed_at >= expires_at)
);
CREATE UNIQUE INDEX pending_manager_invitation ON plazahub.invitations (plaza_id, email)
  WHERE kind = 'manager' AND status = 'pending';
CREATE UNIQUE INDEX pending_tenant_invitation ON plazahub.invitations (plaza_id, tenant_id, email)
  WHERE kind = 'tenant' AND status = 'pending';
CREATE INDEX invitations_by_plaza ON plazahub.invitations (plaza_id, status, expires_at);

CREATE TABLE plazahub.invitation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plaza_id uuid NOT NULL,
  invitation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('issued', 'accepted', 'revoked', 'expired')),
  actor_id uuid REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL,
  FOREIGN KEY (plaza_id, invitation_id) REFERENCES plazahub.invitations(plaza_id, id) ON DELETE RESTRICT,
  UNIQUE (invitation_id, action),
  CHECK ((action = 'expired' AND actor_id IS NULL) OR (action <> 'expired' AND actor_id IS NOT NULL))
);
CREATE INDEX invitation_events_by_plaza ON plazahub.invitation_events (plaza_id, invitation_id, occurred_at);

CREATE FUNCTION plazahub.protect_invitation_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invitation history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status = 'pending'
    OR (NEW.id, NEW.plaza_id, NEW.kind, NEW.tenant_id, NEW.email, NEW.token_hash, NEW.created_by, NEW.created_at, NEW.expires_at)
      IS DISTINCT FROM (OLD.id, OLD.plaza_id, OLD.kind, OLD.tenant_id, OLD.email, OLD.token_hash, OLD.created_by, OLD.created_at, OLD.expires_at) THEN
    RAISE EXCEPTION 'Invitation identity and closed history are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_invitation_history BEFORE UPDATE OR DELETE ON plazahub.invitations
  FOR EACH ROW EXECUTE FUNCTION plazahub.protect_invitation_history();

CREATE FUNCTION plazahub.protect_invitation_events() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Invitation events are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER protect_invitation_events BEFORE UPDATE OR DELETE ON plazahub.invitation_events
  FOR EACH ROW EXECUTE FUNCTION plazahub.protect_invitation_events();
ALTER TABLE plazahub.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plazahub.invitation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON plazahub.invitations, plazahub.invitation_events FROM PUBLIC;
REVOKE ALL ON FUNCTION plazahub.protect_invitation_history(), plazahub.protect_invitation_events() FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA plazahub FROM PUBLIC;
