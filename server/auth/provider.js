// A stateless adapter: no shared SDK login state or browser token storage.
// Native fetch is sufficient for this small, explicitly bounded Auth API slice.
export class AuthenticationError extends Error {
  constructor(code = 'AUTHENTICATION_FAILED') { super(code); this.code = code; }
}

export function readAuthConfig(environment = process.env) {
  const values = [environment.SUPABASE_URL, environment.SUPABASE_PUBLISHABLE_KEY, environment.SESSION_ENCRYPTION_KEY];
  if (values.every(value => value === undefined)) return null;
  if (values.some(value => typeof value !== 'string' || !value || value !== value.trim())) {
    throw new Error('Authentication configuration is incomplete or invalid.');
  }
  let url;
  try { url = new URL(values[0]); } catch { throw new Error('Authentication configuration is incomplete or invalid.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.port
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^sb_publishable_[A-Za-z0-9_-]{16,128}$/.test(values[1]) || values[2].length !== 64 || !/^[a-f0-9]+$/i.test(values[2])) {
    throw new Error('Authentication configuration is incomplete or invalid.');
  }
  return { url:url.origin, publishableKey:values[1], encryptionKey:Buffer.from(values[2], 'hex') };
}

const uuid = value => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

export function createAuthProvider({ url, publishableKey }, { fetchRequest = fetch, clock = Date.now } = {}) {
  // Validate at this boundary too; credentials must never follow an arbitrary URL.
  const base = readAuthConfig({ SUPABASE_URL:url, SUPABASE_PUBLISHABLE_KEY:publishableKey, SESSION_ENCRYPTION_KEY:'0'.repeat(64) }).url;
  async function request(path, { method = 'GET', body, accessToken } = {}) {
    try {
      const response = await fetchRequest(`${base}/auth/v1/${path}`, {
        method, redirect:'error', signal:AbortSignal.timeout(4000), cache:'no-store',
        headers:{ apikey:publishableKey, ...(body ? { 'Content-Type':'application/json' } : {}),
          ...(accessToken ? { Authorization:`Bearer ${accessToken}` } : {}) },
        ...(body ? { body:JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new AuthenticationError([400, 401, 403, 404, 422].includes(response.status) ? 'AUTHENTICATION_FAILED' : 'AUTH_UNAVAILABLE');
      }
      if (response.status === 204) return null;
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 64 * 1024) { await reader.cancel(); throw new Error(); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('AUTH_UNAVAILABLE');
    }
  }

  async function getUser(accessToken) {
    const user = await request('user', { accessToken });
    if (!uuid(user?.id) || !Number.isFinite(Date.parse(user.email_confirmed_at)) || user.is_anonymous !== false) {
      throw new AuthenticationError();
    }
    return { subject:user.id };
  }

  async function grant(type, body) {
    const result = await request(`token?grant_type=${type}`, { method:'POST', body });
    const issuedAt = clock();
    if (typeof result?.access_token !== 'string' || !result.access_token || result.access_token.length > 16000
      || typeof result.refresh_token !== 'string' || !result.refresh_token || result.refresh_token.length > 16000
      || result.token_type !== 'bearer' || !Number.isInteger(result.expires_in) || result.expires_in < 1 || result.expires_in > 86400) {
      throw new AuthenticationError('AUTH_UNAVAILABLE');
    }
    const user = await getUser(result.access_token);
    if (issuedAt + result.expires_in * 1000 <= clock()) throw new AuthenticationError('AUTH_UNAVAILABLE');
    return { accessToken:result.access_token, refreshToken:result.refresh_token,
      expiresAt:issuedAt + result.expires_in * 1000, subject:user.subject };
  }

  return {
    password: (email, password) => grant('password', { email, password }),
    refresh: refreshToken => grant('refresh_token', { refresh_token:refreshToken }),
    getUser,
    async logout(accessToken) { await request('logout?scope=local', { method:'POST', accessToken }); },
  };
}
