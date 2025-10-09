const KEY = 'bb_jwt'

export function setToken(t: string) {
  localStorage.setItem(KEY, t)
}
export function getToken() {
  return localStorage.getItem(KEY)
}
export function logout() {
  localStorage.removeItem(KEY)
}
