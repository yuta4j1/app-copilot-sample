import type { ChatTurn, Form, GenerateResponse } from '@app/schema';
import { buildMessages, defaultClient, type Client } from './client.ts';
import { runAgent } from './run.ts';

/** バリデーションエラー時に自動修正させる最大回数 */
export const MAX_REPAIRS = 2;

type Request = {
  prompt: string;
  form: Form | null;
  history: ChatTurn[];
};

type Options = {
  client?: Client;
  maxRepairs?: number;
};

/** 指示文からフォームを生成・編集する */
export async function generateForm(
  { prompt, form, history }: Request,
  { client = defaultClient, maxRepairs = MAX_REPAIRS }: Options = {},
): Promise<GenerateResponse> {
  return runAgent({ client, messages: buildMessages(history, prompt, form), form, maxRepairs });
}
