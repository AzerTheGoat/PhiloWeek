import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'pw-mobile-session-token'
const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://philoweek-production.up.railway.app/api').replace(/\/$/, '')

export type MobileUser = { id: string; username: string }
type SessionResponse = MobileUser & { token: string; expires_in_ms: number }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(payload.error || 'Une erreur est survenue.', response.status)
  return payload as T
}

export async function saveToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
}

export const getStoredToken = () => SecureStore.getItemAsync(TOKEN_KEY)
export const clearStoredToken = () => SecureStore.deleteItemAsync(TOKEN_KEY)

export async function login(username: string, password: string) {
  return request<SessionResponse>('/auth/mobile/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  })
}

export async function register(username: string, password: string) {
  return request<SessionResponse>('/auth/mobile/register', {
    method: 'POST', body: JSON.stringify({ username, password }),
  })
}

export const getMe = (token: string) => request<MobileUser>('/auth/me', {}, token)
export const logout = (token: string) => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }, token)

export const getFiles = (token: string) => request<FileNode[]>('/files', {}, token)
export const getTodos = (token: string) => request<Todo[]>('/todos?status=open', {}, token)
export const createIdea = (token: string, title: string) => request('/inbox/ideas', {
  method: 'POST', body: JSON.stringify({ title }),
}, token)
export const getArticles = (token: string) => request<Article[]>('/social-journal/articles?scope=feed', {}, token)

export type FileNode = { id: string; name: string; type: 'file' | 'folder'; children?: FileNode[] }
export type Todo = { id: string; title: string; due_at?: string | null }
export type Article = { id: string; title: string; excerpt?: string | null; author_username?: string | null; published_on?: string | null; comment_count?: number }
