import type Anthropic from '@anthropic-ai/sdk';
import { validateForm, type GenerateResponse, type RepairHistory } from '@app/schema';
import { createMessage, createMetrics, stopMessage, textOf, type Client } from './client.ts';
import { renderFormTool } from './tools.ts';

type Options = {
  client: Client;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxRepairs: number;
};

/**
 * 全体再生成方式: render_form でフォーム定義の全体を出力させる。
 * 生成 → バリデーション → エラーを tool_result で返して再生成、を maxRepairs 回まで繰り返す。
 */
export async function regenerate({ client, messages: initial, maxRepairs }: Options): Promise<GenerateResponse> {
  const messages = [...initial];
  const repairs: RepairHistory = [];
  const metrics = createMetrics('regenerate');

  for (let attempt = 0; ; attempt++) {
    const response = await createMessage(client, {
      mode: 'regenerate',
      tools: [renderFormTool],
      messages,
      parallelToolUse: false,
    });
    metrics.record(response);

    const stopped = stopMessage(response);
    if (stopped) return { type: 'message', message: stopped, repairs, metrics: metrics.done() };

    const text = textOf(response.content);
    const toolUse = response.content.find(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === 'tool_use' && block.name === renderFormTool.name,
    );
    if (!toolUse) {
      const message = text || '応答が空でした。もう一度お試しください。';
      return { type: 'message', message, repairs, metrics: metrics.done() };
    }

    const message = text || undefined;
    const result = validateForm(toolUse.input);
    console.log(`[regenerate] attempt=${attempt + 1} valid=${result.success}${result.success ? '' : ` errors=${JSON.stringify(result.errors)}`}`);
    if (result.success) return { type: 'form', form: result.form, message, repairs, metrics: metrics.done() };

    if (attempt >= maxRepairs) {
      return { type: 'invalid', errors: result.errors, raw: toolUse.input, message, repairs, metrics: metrics.done() };
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
