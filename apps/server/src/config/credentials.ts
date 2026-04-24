/**
 * LIS login from **environment only** (same precedence as Autobots CBC / shared bot .env):
 * 1. `CBC_LOGIN_USERNAME` / `CBC_LOGIN_PASSWORD`
 * 2. `LOGIN_USERNAME` / `LOGIN_PASSWORD`
 * 3. `LIS_USERNAME` / `LIS_PASSWORD`
 * 4. Hardcoded defaults (same as `cbc_reader_bot.js` when env is unset)
 */
export const CBC_DEFAULT_USERNAME = 'JASKIRAT';
export const CBC_DEFAULT_PASSWORD = 'JASKIRAT@123';

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v == null) return undefined;
  const t = String(v).trim();
  return t || undefined;
}

export function resolveLisCredentialsFromEnv(): { username: string; password: string } {
  const username =
    trimEnv('CBC_LOGIN_USERNAME') ||
    trimEnv('LOGIN_USERNAME') ||
    trimEnv('LIS_USERNAME') ||
    CBC_DEFAULT_USERNAME;
  const password =
    trimEnv('CBC_LOGIN_PASSWORD') ||
    trimEnv('LOGIN_PASSWORD') ||
    trimEnv('LIS_PASSWORD') ||
    CBC_DEFAULT_PASSWORD;
  return { username, password };
}
