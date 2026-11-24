export async function apiRequest<T>(
  apiUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, options)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body: { detail?: string } = await response.json()
      if (body.detail) message = body.detail
    } catch (error) {
      console.error('Could not read the API error response.', error)
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export function jsonOptions(method: string, value: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  }
}
