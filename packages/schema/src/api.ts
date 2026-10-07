import * as v from 'valibot';
import { FormSchema } from './form.ts';
import type { Form } from './form.ts';

export const ChatTurnSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  text: v.string(),
});
export type ChatTurn = v.InferOutput<typeof ChatTurnSchema>;

export const GenerateRequestSchema = v.object({
  prompt: v.pipe(v.string(), v.trim(), v.minLength(1)),
  /** 編集対象の現在のフォーム。新規作成時は null */
  form: v.optional(v.nullable(FormSchema), null),
  /** これまでの会話(今回の prompt は含まない) */
  history: v.optional(v.pipe(v.array(ChatTurnSchema), v.maxLength(50)), []),
});

export type GenerateRequest = v.InferInput<typeof GenerateRequestSchema>;

/** Agent に差し戻したエラー(バリデーションエラー・操作の失敗)の履歴 */
export type RepairHistory = string[][];

/** 1リクエストあたりの計測値 */
export type Metrics = {
  apiCalls: number;
  /** キャッシュを使わずに処理された入力トークン */
  inputTokens: number;
  /** キャッシュから読み込んだ入力トークン(通常の約1/10の料金) */
  cacheReadTokens: number;
  /** キャッシュに書き込んだ入力トークン(通常の約1.25倍の料金) */
  cacheWriteTokens: number;
  outputTokens: number;
  durationMs: number;
  /** ツールごとの呼び出し回数(全体置き換えと差分操作の使い分けを見るため) */
  toolCalls: Record<string, number>;
};

type Common = { repairs: RepairHistory; metrics: Metrics };

export type GenerateResponse =
  | ({ type: 'form'; form: Form; message?: string } & Common)
  | ({ type: 'invalid'; errors: string[]; raw: unknown; message?: string } & Common)
  | ({ type: 'message'; message: string } & Common);
