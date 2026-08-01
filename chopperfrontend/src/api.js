// Chopper API Client — Passphrase + JWT Authentication
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://chopper-60036478430.development.catalystserverless.in';

const TOKEN_KEY = 'chopper_jwt';

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Checks whether the stored JWT is present and not yet expired,
 * by decoding the payload client-side — no network call needed.
 * Returns false if the token is missing, malformed, or expired.
 */
export function isTokenValid() {
  const token = getToken();
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    // base64url → base64 → JSON
    const padding = (4 - (parts[1].length % 4)) % 4;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding);
    const payload = JSON.parse(atob(b64));
    const nowSecs = Math.floor(Date.now() / 1000);
    return typeof payload.exp === 'number' && payload.exp > nowSecs;
  } catch {
    return false;
  }
}

/**
 * Returns auth headers with the stored JWT in a custom header.
 * Uses X-Chopper-Token instead of Authorization to avoid Catalyst
 * intercepting and stripping the header for its own native auth.
 */
function getAuthHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Chopper-Token': token } : {})
  };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Authenticates with the server using a passphrase.
 * On success, stores the JWT and returns { success: true }.
 * On failure, returns { error: string }.
 */
export async function login(passphrase) {
  try {
    const res = await fetch(`${BASE_URL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase })
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || `HTTP ${res.status}` };
    }
    setToken(data.token);
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Network error' };
  }
}

/**
 * Logs out by clearing the stored JWT.
 */
export function logout() {
  clearToken();
}

// ── Data API ──────────────────────────────────────────────────────────────────

export async function fetchDashboardData() {
  try {
    const res = await fetch(`${BASE_URL}/dashboard`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      clearToken();
      return { entries: [], reactions: [], confirmedTriggers: [], unauthenticated: true };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API error:', err.message);
    return { entries: [], reactions: [], confirmedTriggers: [], error: err.message };
  }
}

export async function addLogEntry(entry) {
  try {
    const res = await fetch(`${BASE_URL}/entries`, {
      method: entry.id ? 'PUT' : 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(entry)
    });
    if (res.status === 401) {
      clearToken();
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API error on save entry:', err.message);
    return { error: err.message };
  }
}

export async function updateLogEntry(entry) {
  return addLogEntry(entry);
}

export async function deleteLogEntry(id) {
  try {
    const res = await fetch(`${BASE_URL}/entries?id=${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      clearToken();
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

export async function addReaction(reaction) {
  try {
    const res = await fetch(`${BASE_URL}/reactions`, {
      method: reaction.id ? 'PUT' : 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reaction)
    });
    if (res.status === 401) {
      clearToken();
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API error on save reaction:', err.message);
    return { error: err.message };
  }
}

export async function updateReaction(reaction) {
  return addReaction(reaction);
}

export async function deleteReaction(id) {
  try {
    const res = await fetch(`${BASE_URL}/reactions?id=${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      clearToken();
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

export async function addConfirmedTrigger(itemName) {
  try {
    const res = await fetch(`${BASE_URL}/triggers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ itemName, confirmedAt: new Date().toISOString() })
    });
    if (res.status === 401) {
      clearToken();
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}