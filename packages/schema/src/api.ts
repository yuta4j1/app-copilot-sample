import * as v from 'valibot';
import { FormSchema } from './form.ts';
import type { Form } from './form.ts';

export const EditModeSchema = v.picklist(['regenerate', 'patch']);
/** regenerate: フォーム全体を再生成する / patch: 差分操作ツールで編集する */
export type EditMode = v.InferOutput<typeof EditModeSchema>;

export const ChatTurnSchema = v.object({
  role: v.picklist(['user', 'assistant']),
  text: v.string(),
});
export type ChatTurn = v.InferOutput<typeof ChatTurnSchema>;

export const GenerateRequestSchema = v.object({
  prompt: v.pipe(v.string(), v.trim(), v.minLength(1)),
  mode: v.optional(EditModeSchema, 'regenerate'),
  /** 編集対象の現在のフォーム。新規作成時は null */
  form: v.optional(v.nullable(FormSchema), null),
  /** これまでの会話(今回の prompt は含まない) */
  history: v.optional(v.pipe(v.array(ChatTurnSchema), v.maxLength(50)), []),
});

export type GenerateRequest = v.InferInput<typeof GenerateRequestSchema>;

/** Agent に差し戻したエラー(バリデーションエラー・操作の失敗)の履歴 */
export type RepairHistory = string[][];

/** 方式比較用の計測値 */
export type Metrics = {
  mode: EditMode;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

type Common = { repairs: RepairHistory; metrics: Metrics };

export type GenerateResponse =
  | ({ type: 'form'; form: Form; message?: string } & Common)
  | ({ type: 'invalid'; errors: string[]; raw: unknown; message?: string } & Common)
  | ({ type: 'message'; message: string } & Common);
