export interface CognitoAuthConfig {
  region: string;
  poolId: string;
  clientId: string;
  endpoint: string;
}

export interface NewPasswordChallenge {
  username: string;
  session: string;
  requiredAttributes: string[];
}

export type SignInResult =
  | { status: 'signed_in' }
  | { status: 'new_password_required'; challenge: NewPasswordChallenge };

type AuthResult = {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type CognitoResponse = {
  AuthenticationResult?: AuthResult;
  ChallengeName?: string;
  ChallengeParameters?: Record<string, string>;
  Session?: string;
  message?: string;
  __type?: string;
};

const STORAGE = {
  idToken: 'ezway_cognito_id_token',
  accessToken: 'ezway_cognito_access_token',
  refreshToken: 'ezway_cognito_refresh_token',
};

const metaEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});

export function authConfigFrom(env: Record<string, string | undefined>): CognitoAuthConfig {
  const poolId = String(env.VITE_COGNITO_USER_POOL_ID || '').trim();
  const clientId = String(env.VITE_COGNITO_USER_POOL_CLIENT_ID || '').trim();
  const separator = poolId.indexOf('_');
  const region = separator > 0 ? poolId.slice(0, separator) : '';
  if (!poolId || !clientId || !region) {
    throw new Error('EZ-WAY Cognito authentication is not configured.');
  }
  return {
    region,
    poolId,
    clientId,
    endpoint: `https://cognito-idp.${region}.amazonaws.com/`,
  };
}

export function getAuthConfig(): CognitoAuthConfig {
  return authConfigFrom(metaEnv);
}

export function isPublicShareLocation(url: string): boolean {
  const parsed = new URL(url, 'https://ezway.local/');
  return Boolean(parsed.searchParams.get('token')?.trim() || parsed.searchParams.get('share')?.trim());
}

const browserStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const raw = typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary');
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
};

const tokenIsUsable = (token: string | null, skewSeconds = 60): token is string => {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) return false;
  return exp > Math.floor(Date.now() / 1000) + skewSeconds;
};

const persistAuthResult = (result?: AuthResult) => {
  if (!result) return;
  const storage = browserStorage();
  if (!storage) return;
  if (result.IdToken) storage.setItem(STORAGE.idToken, result.IdToken);
  if (result.AccessToken) storage.setItem(STORAGE.accessToken, result.AccessToken);
  if (result.RefreshToken) storage.setItem(STORAGE.refreshToken, result.RefreshToken);
};

const clearTokens = () => {
  const storage = browserStorage();
  if (!storage) return;
  Object.values(STORAGE).forEach((key) => storage.removeItem(key));
};

async function cognitoRequest(
  config: CognitoAuthConfig,
  target: 'InitiateAuth' | 'RespondToAuthChallenge',
  body: Record<string, unknown>,
): Promise<CognitoResponse> {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as CognitoResponse;
  if (!response.ok) {
    const message = String(payload.message || 'Cognito sign-in request failed.');
    throw new Error(message);
  }
  return payload;
}

export async function signInWithConfig(
  config: CognitoAuthConfig,
  email: string,
  password: string,
): Promise<SignInResult> {
  const username = String(email || '').trim();
  if (!username || !password) throw new Error('Email and password are required.');

  const payload = await cognitoRequest(config, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: config.clientId,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });

  if (payload.AuthenticationResult?.IdToken) {
    persistAuthResult(payload.AuthenticationResult);
    return { status: 'signed_in' };
  }

  if (payload.ChallengeName === 'NEW_PASSWORD_REQUIRED' && payload.Session) {
    let requiredAttributes: string[] = [];
    const rawRequired = payload.ChallengeParameters?.requiredAttributes;
    if (rawRequired) {
      try {
        const parsed = JSON.parse(rawRequired);
        if (Array.isArray(parsed)) requiredAttributes = parsed.map(String);
      } catch {
        requiredAttributes = [];
      }
    }
    const challengeUsername = payload.ChallengeParameters?.USER_ID_FOR_SRP
      || payload.ChallengeParameters?.USERNAME
      || username;
    return {
      status: 'new_password_required',
      challenge: {
        username: challengeUsername,
        session: payload.Session,
        requiredAttributes,
      },
    };
  }

  throw new Error(`Unsupported Cognito challenge: ${payload.ChallengeName || 'unknown'}.`);
}

export async function signIn(email: string, password: string): Promise<SignInResult> {
  return signInWithConfig(getAuthConfig(), email, password);
}

export async function completeNewPassword(
  challenge: NewPasswordChallenge,
  newPassword: string,
): Promise<void> {
  if (!newPassword) throw new Error('A new password is required.');
  if (challenge.requiredAttributes.length > 0) {
    throw new Error(`Cognito requires additional attributes before sign-in: ${challenge.requiredAttributes.join(', ')}`);
  }
  const config = getAuthConfig();
  const payload = await cognitoRequest(config, 'RespondToAuthChallenge', {
    ChallengeName: 'NEW_PASSWORD_REQUIRED',
    ClientId: config.clientId,
    ChallengeResponses: {
      USERNAME: challenge.username,
      NEW_PASSWORD: newPassword,
    },
    Session: challenge.session,
  });
  if (!payload.AuthenticationResult?.IdToken) {
    throw new Error(`Unsupported Cognito challenge: ${payload.ChallengeName || 'unknown'}.`);
  }
  persistAuthResult(payload.AuthenticationResult);
}

export function getIdToken(): string | null {
  const token = browserStorage()?.getItem(STORAGE.idToken) || null;
  return tokenIsUsable(token) ? token : null;
}

export async function restoreSession(): Promise<boolean> {
  if (getIdToken()) return true;
  const storage = browserStorage();
  const refreshToken = storage?.getItem(STORAGE.refreshToken) || null;
  if (!refreshToken) {
    clearTokens();
    return false;
  }
  try {
    const config = getAuthConfig();
    const payload = await cognitoRequest(config, 'InitiateAuth', {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: config.clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
    if (!payload.AuthenticationResult?.IdToken) throw new Error('Refresh did not return an ID token.');
    persistAuthResult({ ...payload.AuthenticationResult, RefreshToken: refreshToken });
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

export function signOut(): void {
  clearTokens();
}
