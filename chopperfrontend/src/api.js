// Chopper API Client

const BASE_URL = 'https://chopper-60036478430.development.catalystserverless.in/server/chopper_api/execute';

export async function fetchDashboardData() {
  try {
    const res = await fetch(`${BASE_URL}/dashboard`, { credentials: 'include' });
    if (res.status === 401) {
      return { entries: [], reactions: [], confirmedTriggers: [], unauthenticated: true };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('API error:', err.message);
    return { entries: [], reactions: [], confirmedTriggers: [], error: err.message };
  }
}

export async function addLogEntry(entry) {
  try {
    const res = await fetch(`${BASE_URL}/entries`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (res.status === 401) {
      alert('Session expired. Please sign in to log items.');
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API error on add entry:', err.message);
    return { error: err.message };
  }
}

export async function deleteLogEntry(id) {
  try {
    const res = await fetch(`${BASE_URL}/entries?id=${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}

export async function addReaction(reaction) {
  try {
    const res = await fetch(`${BASE_URL}/reactions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reaction)
    });
    if (res.status === 401) {
      alert('Session expired. Please sign in to log reactions.');
      return { error: 'unauthenticated' };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('API error on add reaction:', err.message);
    return { error: err.message };
  }
}

export async function deleteReaction(id) {
  try {
    const res = await fetch(`${BASE_URL}/reactions?id=${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
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
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemName, confirmedAt: new Date().toISOString() })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { error: err.message };
  }
}