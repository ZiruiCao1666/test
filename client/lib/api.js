const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL || '';
export const API_BASE_URL = rawBaseUrl.trim().replace(/\/+$/, '');

export class ApiRequestError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = Number(options.status) || 0;
    this.data = options.data || {};
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function readJsonSafely(response) {
  const raw = await response.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (_parseError) {
    return {};
  }
}

export function getApiErrorMessage(data, fallbackMessage) {
  const safeData = data || {};

  if (Array.isArray(safeData.errors) && safeData.errors.length > 0) {
    const firstError = safeData.errors[0] || {};
    if (typeof firstError.longMessage === 'string' && firstError.longMessage) {
      return firstError.longMessage;
    }
    if (typeof firstError.message === 'string' && firstError.message) {
      return firstError.message;
    }
  }

  if (typeof safeData.error === 'string' && safeData.error) {
    return safeData.error;
  }

  if (typeof safeData.message === 'string' && safeData.message) {
    return safeData.message;
  }

  return fallbackMessage;
}

function buildApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
  }

  const safePath = String(path || '').trim();
  if (safePath === '') {
    return API_BASE_URL;
  }

  if (/^https?:\/\//i.test(safePath)) {
    return safePath;
  }

  if (safePath.startsWith('/')) {
    return API_BASE_URL + safePath;
  }

  return API_BASE_URL + '/' + safePath;
}

function getFallbackMessage(fallbackMessage, status) {
  if (typeof fallbackMessage === 'function') {
    return fallbackMessage(status);
  }

  if (typeof fallbackMessage === 'string' && fallbackMessage) {
    return fallbackMessage;
  }

  return 'Request failed (HTTP ' + String(status) + ')';
}

async function apiRequest(path, token, options = {}) {
  const method = options.method || 'GET';
  const body = options.body;
  const fallbackMessage = options.fallbackMessage;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;

  const controller = new AbortController();
  const headers = {};
  if (typeof token === 'string' && token.trim() !== '') {
    headers.Authorization = 'Bearer ' + token;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const requestBody = body === undefined ? undefined : JSON.stringify(body);

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildApiUrl(path), {
      method,
      headers,
      body: requestBody,
      signal: controller.signal,
    });
    const data = await readJsonSafely(response);

    if (!response.ok) {
      throw new ApiRequestError(
        getApiErrorMessage(data, getFallbackMessage(fallbackMessage, response.status)),
        {
          status: response.status,
          data,
        }
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function apiGet(path, token, options = {}) {
  return apiRequest(path, token, { ...options, method: 'GET' });
}

export function apiPost(path, token, body, options = {}) {
  return apiRequest(path, token, { ...options, method: 'POST', body });
}

export function apiPut(path, token, body, options = {}) {
  return apiRequest(path, token, { ...options, method: 'PUT', body });
}

export function apiDelete(path, token, options = {}) {
  return apiRequest(path, token, { ...options, method: 'DELETE' });
}
