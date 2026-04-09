const normalizeBaseUrl = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\/+$/, '');
};

export const API_BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL);

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

const hasHeader = (headers, headerName) => {
  const normalizedHeaderName = headerName.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalizedHeaderName);
};

const buildApiUrl = (path, baseUrl = API_BASE_URL) => {
  const safeBaseUrl = normalizeBaseUrl(baseUrl);
  if (!safeBaseUrl) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Set it to your Render URL and restart Expo.');
  }

  const safePath = typeof path === 'string' ? path.trim() : '';
  if (!safePath) {
    return safeBaseUrl;
  }

  if (/^https?:\/\//i.test(safePath)) {
    return safePath;
  }

  if (safePath.startsWith('/')) {
    return safeBaseUrl + safePath;
  }

  return safeBaseUrl + '/' + safePath;
};

const resolveFallbackMessage = (fallbackMessage, status) => {
  if (typeof fallbackMessage === 'function') {
    return fallbackMessage(status);
  }

  if (typeof fallbackMessage === 'string' && fallbackMessage) {
    return fallbackMessage;
  }

  return 'Request failed (HTTP ' + String(status) + ')';
};

async function apiRequest(path, token, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs = 20000,
    baseUrl = API_BASE_URL,
    fallbackMessage,
  } = options;

  const controller = new AbortController();
  const requestHeaders = { ...headers };

  if (token) {
    requestHeaders.Authorization = 'Bearer ' + token;
  }

  let requestBody;
  if (body !== undefined) {
    if (!hasHeader(requestHeaders, 'Content-Type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    requestBody = JSON.stringify(body);
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildApiUrl(path, baseUrl), {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });
    const data = await readJsonSafely(response);

    if (!response.ok) {
      throw new ApiRequestError(
        getApiErrorMessage(data, resolveFallbackMessage(fallbackMessage, response.status)),
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
