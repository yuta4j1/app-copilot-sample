import { serve } from '@hono/node-server';
import Anthropic from '@anthropic-ai/sdk';
import { GenerateRequestSchema, validateForm } from '@app/schema';
import { Hono } from 'hono';
import * as v from 'valibot';
import { generateForm } from './agent/index.ts';

const app = new Hono().basePath('/api');

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: `サーバーエラー: ${error.message}` }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

app.post('/validate', async (c) => c.json(validateForm(await c.req.json())));

app.post('/generate', async (c) => {
  const body = v.safeParse(GenerateRequestSchema, await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: `リクエストが不正です: ${body.issues[0].message}` }, 400);

  try {
    return c.json(await generateForm(body.output));
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return c.json({ error: `LLM API の呼び出しに失敗しました (${error.status ?? 'network'})` }, 502);
    }
    throw error;
  }
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`server listening on http://localhost:${port}`);
});

export type AppType = typeof app;
