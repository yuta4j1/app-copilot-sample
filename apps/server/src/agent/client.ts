import Anthropic from '@anthropic-ai/sdk';
import type { ChatTurn, EditMode, Form, Metrics } from '@app/schema';
import { systemPrompt } from './prompt.ts';

export type Client = Pick<Anthropic, 'beta'>;

const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
// ワークスペースに紐づかない API キーでは、利用するワークスペースをヘッダーで指定する必要がある
export const defaultClient: Client = new Anthropic(
  workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {},
);
const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';

type CreateOptions = {
  mode: EditMode;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
  parallelToolUse: boolean;
};

export function createMessage(client: Client, { mode, tools, messages, parallelToolUse }: CreateOptions) {
  return client.beta.messages.create({
    model,
    max_tokens: 16000,
    // 安全分類器による拒否時に、サーバー側で別モデルへフォールバックする
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: systemPrompt(mode),
    tools,
    // Opus 5.5 は tool_choice の any / tool に非対応のため、auto + プロンプトで呼び出しを指示する
    tool_choice: { type: 'auto', disable_parallel_tool_use: !parallelToolUse },
    messages,
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

export function createMetrics(mode: EditMode) {
  const startedAt = Date.now();
  const metrics: Metrics = { mode, apiCalls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0 };
  return {
    record(response: Anthropic.Beta.BetaMessage) {
      const usage = response.usage;
      metrics.apiCalls += 1;
      metrics.inputTokens +=
        (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
      metrics.outputTokens += usage?.output_tokens ?? 0;
    },
    done(): Metrics {
      return { ...metrics, durationMs: Date.now() - startedAt };
    },
  };
}
