import type Anthropic from '@anthropic-ai/sdk';
import { applyOp, validateForm, type Form, type GenerateResponse, type RepairHistory } from '@app/schema';
import { createMessage, createMetrics, stopMessage, textOf, type Client } from './client.ts';
import { patchTools, renderFormTool } from './tools.ts';

/** 1回のリクエストで Agent を呼び出す最大回数(操作 → 結果の往復が続く場合の安全弁) */
const MAX_TURNS = 10;

type Options = {
  client: Client;
  messages: Anthropic.Beta.BetaMessageParam[];
  form: Form | null;
  maxRepairs: number;
};

type ToolOutcome = { form: Form | null; result: Anthropic.Beta.BetaToolResultBlockParam; error?: string };

/** ツール呼び出しを1つ現在のフォームに適用する */
function runTool(form: Form | null, toolUse: Anthropic.Beta.BetaToolUseBlock): ToolOutcome {
  const fail = (error: string): ToolOutcome => ({
    form,
    error: `${toolUse.name}: ${error}`,
    result: { type: 'tool_result', tool_use_id: toolUse.id, is_error: true, content: error },
  });
  const ok = (next: Form): ToolOutcome => ({
    form: next,
    result: { type: 'tool_result', tool_use_id: toolUse.id, content: 'OK' },
  });

  if (toolUse.name === renderFormTool.name) {
    const result = validateForm(toolUse.input);
    return result.success ? ok(result.form) : fail(`フォーム定義がバリデーションに失敗しました: ${result.errors.join('; ')}`);
  }
  if (!form) return fail('現在のフォームがありません。render_form でフォーム全体を出力してください。');
  const result = applyOp(form, toolUse.name, toolUse.input);
  return result.ok ? ok(result.form) : fail(result.error);
}

/**
 * 差分ツール方式: 現在のフォームに対して差分操作ツールを呼ばせ、サーバー側で順に適用する。
 * 個々の操作の失敗は tool_result で、操作後のフォーム全体のバリデーションエラーはメッセージで返して直させる。
 */
export async function patch({ client, messages: initial, form: initialForm, maxRepairs }: Options): Promise<GenerateResponse> {
  const messages = [...initial];
  const repairs: RepairHistory = [];
  const metrics = createMetrics('patch');
  const tools = initialForm ? patchTools : [renderFormTool];
  let form = initialForm;
  let changed = false;
  let validationFailures = 0;
  const texts: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await createMessage(client, { mode: 'patch', tools, messages, parallelToolUse: true });
    metrics.record(response);

    const stopped = stopMessage(response);
    if (stopped) return { type: 'message', message: stopped, repairs, metrics: metrics.done() };

    const text = textOf(response.content);
    if (text) texts.push(text);
    const toolUses = response.content.filter(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use',
    );

    if (toolUses.length > 0) {
      // 並列に呼ばれた操作も、呼び出し順に1つずつ適用する
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      const errors: string[] = [];
      for (const toolUse of toolUses) {
        const outcome = runTool(form, toolUse);
        form = outcome.form;
        results.push(outcome.result);
        if (outcome.error) errors.push(outcome.error);
        else changed = true;
      }
      console.log(`[patch] turn=${turn + 1} ops=${toolUses.map((t) => t.name).join(',')} errors=${JSON.stringify(errors)}`);
      if (errors.length > 0) repairs.push(errors);

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: results });
      continue;
    }

    // ツールを呼ばずに応答を終えた: 編集完了、または聞き返し
    const message = texts.at(-1);
    if (!changed || !form) {
      return { type: 'message', message: message || '応答が空でした。もう一度お試しください。', repairs, metrics: metrics.done() };
    }

    const result = validateForm(form);
    console.log(`[patch] turn=${turn + 1} done valid=${result.success}`);
    if (result.success) return { type: 'form', form: result.form, message, repairs, metrics: metrics.done() };

    if (validationFailures >= maxRepairs) {
      return { type: 'invalid', errors: result.errors, raw: form, message, repairs, metrics: metrics.done() };
    }
    validationFailures += 1;
    repairs.push(result.errors);
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [
        '操作後のフォームがバリデーションに失敗しました。',
        ...result.errors.map((error) => `- ${error}`),
        '',
        '差分操作ツールでエラーを修正してください。',
      ].join('\n'),
    });
  }

  const final = form ? validateForm(form) : null;
  const errors = final && !final.success ? final.errors : [];
  return {
    type: 'invalid',
    errors: [`操作の往復が上限(${MAX_TURNS}回)に達しました`, ...errors],
    raw: form,
    repairs,
    metrics: metrics.done(),
  };
}
