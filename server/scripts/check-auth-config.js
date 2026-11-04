import { readAuthConfig } from '../auth/provider.js';

// Read-only preflight. It prints names/status only, never configuration values,
// makes no provider request and cannot turn on the live session router.
const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SESSION_ENCRYPTION_KEY'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.log(`Missing local configuration: ${missing.join(', ')}`);
  console.log('Prepare server/.env using server/.env.example. Keep actual values out of chat and Git.');
  process.exitCode = 2;
} else {
  try {
    readAuthConfig();
    console.log('Configuration format is valid. Provider access has not been checked; live login remains disabled.');
  } catch {
    console.error('Invalid configuration. Use the development project HTTPS URL, publishable key and a 64-hex encryption key. Values are not logged.');
    process.exitCode = 1;
  }
}
