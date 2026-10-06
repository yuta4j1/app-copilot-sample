import * as v from 'valibot';
import type { Form } from './form.ts';

export const GenerateRequestSchema = v.object({
  prompt: v.pipe(v.string(), v.trim(), v.minLength(1)),
});

export type GenerateRequest = v.InferOutput<typeof GenerateRequestSchema>;

/** 自動修正の前に失敗した各試行のバリデーションエラー */
export type RepairHistory = string[][];

export type GenerateResponse =
  | { type: 'form'; form: Form; message?: string; repairs: RepairHistory }
  | { type: 'invalid'; errors: string[]; raw: unknown; message?: string; repairs: RepairHistory }
  | { type: 'message'; message: string; repairs: RepairHistory };
