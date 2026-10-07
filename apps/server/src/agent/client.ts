import Anthropic from '@anthropic-ai/sdk';
import type { ChatTurn, Form, Metrics } from '@app/schema';
import { SYSTEM_PROMPT } from './prompt.ts';

export type Client = Pick<Anthropic, 'beta'>;

const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
// ワークスペースに紐づかない API キーでは、利用するワークスペースをヘッダーで指定する必要がある
export const defaultClient: Client = new Anthropic(
  workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {},
);
const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';

type CreateOptions = {
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
};

export function createMessage(client: Client, { tools, messages }: CreateOptions) {
  return client.beta.messages.create({
    model,
    max_tokens: 16000,
    // 安全分類器による拒否時に、サーバー側で別モデルへフォールバックする
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    // プロンプトキャッシュ: tools → system → messages の順に先頭一致でキャッシュされる。
    // system の末尾に明示的なブレークポイントを置き、毎回同じツール定義 + システムプロンプトを確実に再利用する
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools,
    // Opus 5.5 は tool_choice の any / tool に非対応のため、auto + プロンプトで呼び出しを指示する
    tool_choice: { type: 'auto' },
    messages,
    // 伸びていく会話の末尾にも自動でブレークポイントを置き、ループ内の2回目以降の呼び出しで前回までを再利用する
    cache_control: { type: 'ephemeral' },
  });
}

/** これまでの会話と、現在のフォームを添えた今回の指示から messages を組み立てる */
export function buildMessages(history: ChatTurn[], prompt: string, form: Form | null): Anthropic.Beta.BetaMessageParam[] {
  const turns = history
    .filter((turn) => turn.text.trim() !== '')
    .map((turn): Anthropic.Beta.BetaMessageParam => ({ role: turn.role, content: turn.text }));
  // 先頭は user でなければならない
  while (turns[0]?.role === 'assistant') turns.shift();

  const current = form
    ? `現在のフォーム定義:\n\`\`\`json\n${JSON.stringify(form, null, 2)}\n\`\`\``
    : '現在のフォームはありません。';
  return [...turns, { role: 'user', content: `${current}\n\n指示: ${prompt}` }];
}

export const textOf = (content: Anthropic.Beta.BetaContentBlock[]) =>
  content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
    .trim();

/** 応答の stop_reason が続行できないものなら、ユーザー向けのメッセージを返す */
export function stopMessage(response: Anthropic.Beta.BetaMessage): string | undefined {
  if (response.stop_reason === 'refusal') return 'このリクエストは処理できませんでした。';
  if (response.stop_reason === 'max_tokens') return '出力が上限に達したため、処理を完了できませんでした。';
  return undefined;
}

export function createMetrics() {
  const startedAt = Date.now();
  const metrics: Metrics = {
    apiCalls: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    toolCalls: {},
  };
  return {
    record(response: Anthropic.Beta.BetaMessage) {
      const usage = response.usage;
      metrics.apiCalls += 1;
      metrics.inputTokens += usage?.input_tokens ?? 0;
      metrics.cacheReadTokens += usage?.cache_read_input_tokens ?? 0;
      metrics.cacheWriteTokens += usage?.cache_creation_input_tokens ?? 0;
      metrics.outputTokens += usage?.output_tokens ?? 0;
      for (const block of response.content) {
        if (block.type === 'tool_use') metrics.toolCalls[block.name] = (metrics.toolCalls[block.name] ?? 0) + 1;
      }
    },
    done(): Metrics {
      return { ...metrics, durationMs: Date.now() - startedAt };
    },
  };
}
