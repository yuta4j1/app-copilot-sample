import type { ChatTurn, EditMode, Form, GenerateResponse } from '@app/schema';
import { buildMessages, defaultClient, type Client } from './client.ts';
import { patch } from './patch.ts';
import { regenerate } from './regenerate.ts';

/** バリデーションエラー時に自動修正させる最大回数 */
export const MAX_REPAIRS = 2;

type Request = {
  prompt: string;
  mode: EditMode;
  form: Form | null;
  history: ChatTurn[];
};

type Options = {
  client?: Client;
  maxRepairs?: number;
};

/** 指示文からフォームを生成・編集する。mode で全体再生成方式と差分ツール方式を切り替える */
export async function generateForm(
  { prompt, mode, form, history }: Request,
  { client = defaultClient, maxRepairs = MAX_REPAIRS }: Options = {},
): Promise<GenerateResponse> {
  const messages = buildMessages(history, prompt, form);
  return mode === 'patch'
    ? patch({ client, messages, form, maxRepairs })
    : regenerate({ client, messages, maxRepairs });
}
