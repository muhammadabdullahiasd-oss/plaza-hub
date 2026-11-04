import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const validSessionToken = value => typeof value === 'string' && value.length === 43 && /^[\w-]+$/.test(value);
export const hashSessionToken = value => createHash('sha256').update(value).digest('hex');
export const csrfForSession = value => createHmac('sha256', value).update('plazahub:csrf:v1').digest('base64url');
export function matchesCsrf(sessionToken, csrfToken) {
  if (!validSessionToken(sessionToken) || !validSessionToken(csrfToken)) return false;
  return timingSafeEqual(Buffer.from(csrfForSession(sessionToken)), Buffer.from(csrfToken));
}

export function createTokenBox(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Session encryption requires a 32-byte key.');
  const secret = Buffer.from(key);
  return {
    seal(tokens, sessionHash) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', secret, nonce);
      cipher.setAAD(Buffer.from(`plazahub:provider:v1:${sessionHash}`));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
      return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
    },
    open(value, sessionHash) {
      try {
        const [version, nonce, tag, encrypted, extra] = value.split('.');
        if (version !== 'v1' || extra || !encrypted || Buffer.from(nonce, 'base64url').length !== 12 || Buffer.from(tag, 'base64url').length !== 16) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(nonce, 'base64url'));
        decipher.setAAD(Buffer.from(`plazahub:provider:v1:${sessionHash}`));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'));
      } catch { throw new Error('Stored session credentials cannot be read.'); }
    },
  };
}
