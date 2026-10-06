import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { generateForm } from './agent.ts';

const validForm = {
  title: 'お問い合わせ',
  fields: [{ id: 'name', type: 'text', label: 'お名前', required: true }],
};
const invalidForm = {
  title: 'お問い合わせ',
  fields: [{ id: 'plan', type: 'select', label: 'プラン', options: [] }],
};

const toolUseResponse = (input: unknown, id: string) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name: 'render_form', input }],
});

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

describe('generateForm', () => {
  it('1回目で妥当なら修正なしで返す', async () => {
    const { client, requests } = fakeClient([toolUseResponse(validForm, 't1')]);
    const result = await generateForm('問い合わせフォーム', { client });
    expect(result).toMatchObject({ type: 'form', form: validForm, repairs: [] });
    expect(requests).toHaveLength(1);
  });

  it('エラーを tool_result で返し、修正後の結果を採用する', async () => {
    const { client, requests } = fakeClient([toolUseResponse(invalidForm, 't1'), toolUseResponse(validForm, 't2')]);
    const result = await generateForm('問い合わせフォーム', { client });

    expect(result.type).toBe('form');
    expect(result.repairs).toHaveLength(1);
    const retry = requests[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true }],
    });
  });

  it('上限まで直らなければ invalid を返す', async () => {
    const { client, requests } = fakeClient([
      toolUseResponse(invalidForm, 't1'),
      toolUseResponse(invalidForm, 't2'),
    ]);
    const result = await generateForm('問い合わせフォーム', { client, maxRepairs: 1 });

    expect(result).toMatchObject({ type: 'invalid', raw: invalidForm });
    expect(result.repairs).toHaveLength(1);
    expect(requests).toHaveLength(2);
  });

  it('ツールを呼ばなければ質問として返す', async () => {
    const { client } = fakeClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'どんなアンケートですか?' }] },
    ]);
    const result = await generateForm('アンケートを作って', { client });
    expect(result).toEqual({ type: 'message', message: 'どんなアンケートですか?', repairs: [] });
  });
});
