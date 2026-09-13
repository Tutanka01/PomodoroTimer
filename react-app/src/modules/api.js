import { t } from './i18n.js';

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// Appel API same-origin : le cookie HttpOnly est envoyé automatiquement.
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body && JSON.stringify(body)
    });
  } catch {
    throw new ApiError('network_error', 0);
  }

  let data = null;
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text);
  } catch {
    // réponse vide ou corps non-JSON : ignoré
  }

  if (!res.ok) throw new ApiError(data?.error || 'server_error', res.status);
  return data;
}

const ERROR_KEYS = {
  invalid_credentials: 'errorInvalidCredentials',
  email_taken: 'errorEmailTaken',
  invalid_input: 'errorInvalidInput',
  too_many_attempts: 'errorTooManyAttempts',
  unauthorized: 'errorUnauthorized',
  network_error: 'errorNetwork'
};

export function errorText(err) {
  return t(ERROR_KEYS[err?.code] || 'errorServer');
}
