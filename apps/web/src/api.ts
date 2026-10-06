import type { GenerateRequest, GenerateResponse } from '@app/schema';

export async function generate(request: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `リクエストに失敗しました (${res.status})`);
  return body as GenerateResponse;
}
