import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import {
  getMicrosoftAuthConfig,
  microsoftAuthority,
  type MicrosoftAuthConfig,
} from '@backend/lib/microsoft-auth-config';
import { loginMicrosoftUser, type MicrosoftLoginResult } from '@backend/server/auth/auth-repo.server';
import { isSecureAuthCookie } from '@backend/server/auth/session.server';

const OAUTH_NONCE_COOKIE = 'nims_oauth_nonce';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read'];

type OAuthStatePayload = {
  nonce: string;
  exp: number;
};

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphMe = {
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
};

function stateSecret(config: MicrosoftAuthConfig): string {
  return config.clientSecret;
}

export function createMicrosoftOAuthState(config: MicrosoftAuthConfig): string {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret(config)).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMicrosoftOAuthState(config: MicrosoftAuthConfig, state: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expected = createHmac('sha256', stateSecret(config)).update(body).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function buildMicrosoftAuthorizeUrl(config: MicrosoftAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: SCOPES.join(' '),
    state,
    prompt: 'select_account',
  });
  return `${microsoftAuthority(config.tenantId)}/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(
  config: MicrosoftAuthConfig,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: SCOPES.join(' '),
  });

  const res = await fetch(`${microsoftAuthority(config.tenantId)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) {
    throw new Error(
      'Sign-in with Microsoft did not complete. Return to the sign-in page and try again.',
    );
  }
  if (!json.access_token) {
    throw new Error(
      'Sign-in with Microsoft did not complete. Return to the sign-in page and try again.',
    );
  }
  return json;
}

async function fetchGraphProfile(accessToken: string): Promise<GraphMe> {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    throw new Error(
      'We could not load your Microsoft profile. Try signing in again, or contact IT if this keeps happening.',
    );
  }
  return (await res.json()) as GraphMe;
}

function resolveEmail(profile: GraphMe, allowedDomains: string[]): string {
  const raw = (profile.mail ?? profile.userPrincipalName ?? '').trim().toLowerCase();
  if (!raw || !raw.includes('@')) {
    throw new Error(
      'Your Microsoft account does not include an email address. Use an account that has one, or contact IT for help.',
    );
  }
  if (allowedDomains.length > 0) {
    const domain = raw.split('@')[1] ?? '';
    if (!allowedDomains.includes(domain)) {
      throw new Error(
        'This email domain is not authorized for this application. Sign in with your organization email, or contact IT.',
      );
    }
  }
  return raw;
}

function setOAuthNonceCookie(nonce: string): void {
  setCookie(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: isSecureAuthCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.ceil(OAUTH_STATE_TTL_MS / 1000),
  });
}

export function getMicrosoftLoginRedirect(): { url: string; state: string } {
  const config = getMicrosoftAuthConfig();
  if (!config) {
    throw new Error(
      'Microsoft sign-in is not set up on this server. Contact your administrator or use another sign-in option.',
    );
  }
  const state = createMicrosoftOAuthState(config);
  const payload = parseOAuthStatePayload(config, state);
  if (payload) setOAuthNonceCookie(payload.nonce);
  return { url: buildMicrosoftAuthorizeUrl(config, state), state };
}

function parseOAuthStatePayload(config: MicrosoftAuthConfig, state: string): OAuthStatePayload | null {
  if (!verifyMicrosoftOAuthState(config, state)) return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export async function completeMicrosoftLogin(
  code: string,
  state: string,
): Promise<MicrosoftLoginResult> {
  const config = getMicrosoftAuthConfig();
  if (!config) {
    throw new Error(
      'Microsoft sign-in is not set up on this server. Contact your administrator or use another sign-in option.',
    );
  }
  const statePayload = parseOAuthStatePayload(config, state);
  if (!statePayload) {
    throw new Error('Your sign-in session expired. Go back to the sign-in page and start again.');
  }

  const nonceCookie = getCookie(OAUTH_NONCE_COOKIE);
  if (!nonceCookie || nonceCookie !== statePayload.nonce) {
    throw new Error('Your sign-in session expired. Go back to the sign-in page and start again.');
  }
  deleteCookie(OAUTH_NONCE_COOKIE, { path: '/' });

  const tokens = await exchangeCodeForTokens(config, code, config.redirectUri);
  const profile = await fetchGraphProfile(tokens.access_token!);
  const email = resolveEmail(profile, config.allowedEmailDomains);

  return loginMicrosoftUser({
    entraOid: profile.id,
    email,
  });
}
