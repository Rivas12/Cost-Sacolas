/**
 * Cliente API centralizado que usa VITE_API_URL do .env
 * Garante consistência em todas as requisições
 */

export function getApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  return `${baseUrl}${path}`;
}

export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = getApiUrl(path);
  return fetch(url, options);
}

export async function apiJson<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}
