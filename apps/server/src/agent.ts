import Anthropic from '@anthropic-ai/sdk';
import { formJsonSchema, validateForm, type GenerateResponse, type RepairHistory } from '@app/schema';
import { SYSTEM_PROMPT } from './prompt.ts';

const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
// ワークスペースに紐づかない API キーでは、利用するワークスペースをヘッダーで指定する必要がある
const defaultClient = new Anthropic(
  workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {},
);
const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';

/** バリデーションエラー時に自動修正させる最大回数 */
export const MAX_REPAIRS = 2;

const renderFormTool: Anthropic.Beta.BetaTool = {
  name: 'render_form',
  description: 'フォーム定義を出力し、画面にプレビューとして描画する。',
  input_schema: formJsonSchema() as Anthropic.Beta.BetaTool.InputSchema,
};

type Options = {
  client?: Pick<Anthropic, 'beta'>;
  maxRepairs?: number;
};

/**
 * 指示文からフォーム定義を生成する。
 * 生成 → バリデーション → エラーを tool_result で返して再生成、を maxRepairs 回まで繰り返す。
 */
export async function generateForm(
  prompt: string,
  { client = defaultClient, maxRepairs = MAX_REPAIRS }: Options = {},
): Promise<GenerateResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  const repairs: RepairHistory = [];

  for (let attempt = 0; ; attempt++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // 安全分類器による拒否時に、サーバー側で別モデルへフォールバックする
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      tools: [renderFormTool],
      // Opus 5.5 は tool_choice の any / tool に非対応のため、auto + プロンプトで呼び出しを指示する
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return { type: 'message', message: 'このリクエストは処理できませんでした。', repairs };
    }
    if (response.stop_reason === 'max_tokens') {
      return { type: 'message', message: '出力が上限に達したため、フォームを生成できませんでした。', repairs };
    }

    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim();
    const toolUse = response.content.find(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === 'tool_use' && block.name === renderFormTool.name,
    );

    if (!toolUse) {
      return { type: 'message', message: text || '応答が空でした。もう一度お試しください。', repairs };
    }

    const message = text || undefined;
    const result = validateForm(toolUse.input);
    console.log(`[generate] attempt=${attempt + 1} valid=${result.success}${result.success ? '' : ` errors=${JSON.stringify(result.errors)}`}`);
    if (result.success) return { type: 'form', form: result.form, message, repairs };

    if (attempt >= maxRepairs) {
      return { type: 'invalid', errors: result.errors, raw: toolUse.input, message, repairs };
    }
    repairs.push(result.errors);

    // 応答はそのまま履歴に積み、エラーを tool_result として返して修正させる
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: [
            'フォーム定義がバリデーションに失敗しました。',
            ...result.errors.map((error) => `- ${error}`),
            '',
            'エラーを修正したフォーム定義全体で、render_form をもう一度呼び出してください。',
          ].join('\n'),
        },
      ],
    });
  }
}
