// Shared fetch helper for authenticated app calls. A 401 means the session
// is gone (expired or deactivated), so send the user back to the login screen.
export async function apiFetch(path, { headers, ...rest } = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    ...rest,
  });

  if (res.status === 401) {
    window.location.assign('/');
    throw new Error('Unauthorized');
  }

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Request failed');
  return body;
}

// Login is unauthenticated by definition, so it bypasses apiFetch's 401
// handling: a bad password must show an inline error, not redirect.
export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Login failed');
  return body.user;
}

// Multipart upload: no Content-Type header set explicitly — the browser fills in
// the multipart boundary itself, which apiFetch's fixed JSON header would break.
export async function uploadFile(path, formData) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (res.status === 401) {
    window.location.assign('/');
    throw new Error('Unauthorized');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Upload failed');
  return body;
}
