import type { ApiError, EngineResult, Product, Registry } from './types'

// same-origin: Vite proxies /api to the backend on :8001
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export class EngineError extends Error {
  detail: ApiError
  constructor(detail: ApiError) {
    super(detail.reason)
    this.detail = detail
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`)
  } catch {
    throw new EngineError({ error: 'server_unreachable', reason: 'Cannot reach the BhuVyom API. Start it with: cd backend && uvicorn main:app --reload --port 8001' })
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new EngineError(body && body.reason ? body : { error: `http_${res.status}`, reason: JSON.stringify(body?.detail ?? body) })
  }
  return body as T
}

export const fetchCatalog = () => getJson<{ products: Product[] }>('/api/engines/catalog')
export const fetchRegistry = () => getJson<Registry>('/api/knowledge/methodologies')
export const fetchBoundary = () => getJson<GeoJSON.FeatureCollection>('/api/boundaries/bbmp')

export function fetchResult(endpoint: string, params?: Record<string, string | number>) {
  const q = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : ''
  const sep = endpoint.includes('?') ? '&' : '?'
  return getJson<EngineResult>(q ? `${endpoint}${sep}${q}` : endpoint)
}
