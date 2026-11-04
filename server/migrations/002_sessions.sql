-- Session infrastructure only. No public route or provider identity is enabled
-- by this migration. The migration owner is not a runtime credential.
CREATE TABLE plazahub.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES plazahub.users(id) ON DELETE RESTRICT,
  encrypted_provider_tokens text,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IN ('logout', 'replaced', 'expired', 'account', 'provider', 'unreadable')),
  CHECK (last_seen_at >= created_at AND last_seen_at < absolute_expires_at),
  CHECK (idle_expires_at > last_seen_at AND idle_expires_at <= absolute_expires_at),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL AND encrypted_provider_tokens IS NOT NULL)
    OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL AND encrypted_provider_tokens IS NULL))
);
CREATE INDEX sessions_by_user ON plazahub.sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_by_expiry ON plazahub.sessions (absolute_expires_at);
ALTER TABLE plazahub.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON plazahub.sessions FROM PUBLIC;
