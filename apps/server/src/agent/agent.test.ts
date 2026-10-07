import type Anthropic from '@anthropic-ai/sdk';
import type { Form } from '@app/schema';
import { describe, expect, it } from 'vitest';
import { generateForm } from './index.ts';

const validForm: Form = {
  title: 'お問い合わせ',
  fields: [{ id: 'name', type: 'text', label: 'お名前', required: true }],
};
const invalidForm = {
  title: 'お問い合わせ',
  fields: [{ id: 'plan', type: 'select', label: 'プラン', options: [] }],
};

const usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 5 };
const toolUse = (name: string, input: unknown, id: string) => ({ type: 'tool_use', id, name, input });
const reply = (...content: unknown[]) => ({
  stop_reason: content.some((b) => (b as { type: string }).type === 'tool_use') ? 'tool_use' : 'end_turn',
  content,
  usage,
});
const text = (value: string) => ({ type: 'text', text: value });
const toolNames = (params: Anthropic.Beta.MessageCreateParamsNonStreaming) =>
  params.tools!.map((t) => (t as { name: string }).name);

/** 呼び出しごとに用意した応答を順に返し、受け取ったリクエストを記録するフェイク */
function fakeClient(responses: unknown[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
          requests.push(structuredClone(params));
          const next = responses.shift();
          if (!next) throw new Error('想定外の呼び出し');
          return next;
        },
      },
    },
  } as unknown as Pick<Anthropic, 'beta'>;
  return { client, requests };
}

const request = (overrides: Partial<Parameters<typeof generateForm>[0]> = {}) => ({
  prompt: '問い合わせフォーム',
  form: null,
  history: [],
  ...overrides,
});
const editRequest = (prompt: string) => request({ prompt, form: validForm });

describe('generateForm: 新規作成', () => {
  it('render_form で作成し、完了報告と計測値を返す', async () => {
    const { client, requests } = fakeClient([
      reply(toolUse('render_form', validForm, 't1')),
      reply(text('お問い合わせフォームを作成しました。')),
    ]);
    const result = await generateForm(request(), { client });

    expect(result).toMatchObject({ type: 'form', form: validForm, message: 'お問い合わせフォームを作成しました。', repairs: [] });
    expect(result.metrics).toMatchObject({
      apiCalls: 2,
      inputTokens: 200,
      cacheReadTokens: 100,
      cacheWriteTokens: 10,
      outputTokens: 20,
      toolCalls: { render_form: 1 },
    });
    expect(toolNames(requests[0]!)).toEqual(['render_form', 'add_field', 'update_field', 'remove_field', 'move_field', 'update_form']);
    // ツール定義 + システムプロンプトと、会話の末尾にキャッシュのブレークポイントを置く
    expect(requests[0]!.system).toMatchObject([{ type: 'text', cache_control: { type: 'ephemeral' } }]);
    expect(requests[0]).toMatchObject({ cache_control: { type: 'ephemeral' } });
  });

  it('render_form のバリデーションエラーを tool_result で返し、修正後の結果を採用する', async () => {
    const { client, requests } = fakeClient([
      reply(toolUse('render_form', invalidForm, 't1')),
      reply(toolUse('render_form', validForm, 't2')),
      reply(text('作成しました。')),
    ]);
    const result = await generateForm(request(), { client });

    expect(result).toMatchObject({ type: 'form', form: validForm });
    expect(result.repairs).toHaveLength(1);
    expect(requests[1]!.messages[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }],
    });
  });

  it('ツールを呼ばなければ質問として返す', async () => {
    const { client } = fakeClient([reply(text('どんなアンケートですか?'))]);
    const result = await generateForm(request({ prompt: 'アンケートを作って' }), { client });
    expect(result).toMatchObject({ type: 'message', message: 'どんなアンケートですか?' });
  });

  it('会話履歴と現在のフォームを messages に含める', async () => {
    const { client, requests } = fakeClient([reply(text('了解しました。'))]);
    await generateForm(
      request({
        prompt: '社内イベントの満足度で',
        form: validForm,
        history: [
          { role: 'user', text: 'アンケートを作って' },
          { role: 'assistant', text: 'テーマは何ですか?' },
        ],
      }),
      { client },
    );
    const messages = requests[0]!.messages;
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[2]!.content).toContain('"id": "name"');
    expect(messages[2]!.content).toContain('指示: 社内イベントの満足度で');
  });
});

describe('generateForm: 編集', () => {
  it('並列に呼ばれた差分操作を順に適用し、完了報告を返す', async () => {
    const { client, requests } = fakeClient([
      reply(
        toolUse('add_field', { field: { id: 'tel', type: 'text', label: '電話番号' } }, 't1'),
        toolUse('update_field', { id: 'name', set: { required: false } }, 't2'),
      ),
      reply(text('電話番号欄を追加し、お名前を任意にしました。')),
    ]);
    const result = await generateForm(editRequest('電話番号を追加して名前を任意に'), { client });

    expect(result).toMatchObject({
      type: 'form',
      message: '電話番号欄を追加し、お名前を任意にしました。',
      form: { fields: [{ id: 'name', required: false }, { id: 'tel' }] },
      repairs: [],
      metrics: { apiCalls: 2, toolCalls: { add_field: 1, update_field: 1 } },
    });
    expect(requests[1]!.messages.at(-1)!.content).toHaveLength(2);
  });

  it('render_form で現在のフォームを丸ごと置き換えられる', async () => {
    const replaced: Form = { title: '作り直し', fields: [{ id: 'email', type: 'email', label: 'メール' }] };
    const { client } = fakeClient([reply(toolUse('render_form', replaced, 't1')), reply(text('作り直しました。'))]);
    const result = await generateForm(editRequest('全部作り直して'), { client });
    expect(result).toMatchObject({ type: 'form', form: replaced });
  });

  it('操作の失敗を tool_result のエラーとして返す', async () => {
    const { client, requests } = fakeClient([
      reply(toolUse('remove_field', { id: 'email' }, 't1')),
      reply(toolUse('remove_field', { id: 'name' }, 't2')),
      reply(text('削除しました。')),
    ]);
    const result = await generateForm(editRequest('メール欄を消して'), { client });

    expect(requests[1]!.messages.at(-1)!.content).toMatchObject([{ tool_use_id: 't1', is_error: true }]);
    expect(result.repairs).toEqual([['remove_field: フィールド "email" が存在しません']]);
    expect(result).toMatchObject({ type: 'form', form: { fields: [] } });
  });

  it('操作後のフォームがバリデーションに失敗したら差し戻す', async () => {
    const { client, requests } = fakeClient([
      reply(toolUse('add_field', { field: { id: 'x', type: 'text', label: 'X', showIf: { field: 'nope', op: 'eq', value: 1 } } }, 't1')),
      reply(text('追加しました。')),
      reply(toolUse('update_field', { id: 'x', unset: ['showIf'] }, 't2')),
      reply(text('修正しました。')),
    ]);
    const result = await generateForm(editRequest('X欄を追加'), { client });

    expect(result).toMatchObject({ type: 'form', message: '修正しました。' });
    expect(result.repairs).toHaveLength(1);
    expect(requests[2]!.messages.at(-1)!.content).toContain('バリデーションに失敗しました');
  });

  it('差し戻しが上限を超えたら invalid を返す', async () => {
    const badField = { id: 'x', type: 'text', label: 'X', showIf: { field: 'nope', op: 'eq', value: 1 } };
    const { client, requests } = fakeClient([
      reply(toolUse('add_field', { field: badField }, 't1')),
      reply(text('追加しました。')),
      reply(text('直しました。')),
    ]);
    const result = await generateForm(editRequest('X欄を追加'), { client, maxRepairs: 1 });

    expect(result).toMatchObject({ type: 'invalid', message: '直しました。' });
    expect(requests).toHaveLength(3);
  });

  it('ツールを呼ばなければ質問として返す', async () => {
    const { client } = fakeClient([reply(text('どの項目を変更しますか?'))]);
    const result = await generateForm(editRequest('いい感じにして'), { client });
    expect(result).toMatchObject({ type: 'message', message: 'どの項目を変更しますか?' });
  });
});
