import * as v from 'valibot';
import { FieldSchema, type Field, type Form } from './form.ts';

export const AddFieldInputSchema = v.object({
  field: FieldSchema,
  /** このフィールドの直後に追加する。null なら先頭、省略時は末尾 */
  after: v.optional(v.nullable(v.string())),
});

export const UpdateFieldInputSchema = v.object({
  id: v.string(),
  /** 設定・上書きするプロパティ(type や id の変更も可) */
  set: v.optional(v.record(v.string(), v.unknown())),
  /** 削除するプロパティ名 */
  unset: v.optional(v.array(v.string())),
});

export const RemoveFieldInputSchema = v.object({
  id: v.string(),
});

export const MoveFieldInputSchema = v.object({
  id: v.string(),
  /** このフィールドの直後に移動する。null なら先頭 */
  after: v.nullable(v.string()),
});

export const UpdateFormInputSchema = v.object({
  title: v.optional(v.string()),
  /** null で説明文を削除 */
  description: v.optional(v.nullable(v.string())),
});

export const formOps = {
  add_field: AddFieldInputSchema,
  update_field: UpdateFieldInputSchema,
  remove_field: RemoveFieldInputSchema,
  move_field: MoveFieldInputSchema,
  update_form: UpdateFormInputSchema,
} as const;

export type FormOpName = keyof typeof formOps;

export type ApplyResult = { ok: true; form: Form } | { ok: false; error: string };

const issuesToString = (issues: v.BaseIssue<unknown>[]) =>
  issues.map((issue) => `${v.getDotPath(issue) ?? '(root)'}: ${issue.message}`).join('; ');

const indexOf = (form: Form, id: string) => form.fields.findIndex((field) => field.id === id);

/** after の直後に field を挿入した配列を返す。after が null なら先頭、undefined なら末尾 */
function insertAfter(fields: Field[], field: Field, after: string | null | undefined): Field[] | string {
  if (after === undefined) return [...fields, field];
  if (after === null) return [field, ...fields];
  const index = fields.findIndex((f) => f.id === after);
  if (index === -1) return `after に指定したフィールド "${after}" が存在しません`;
  return [...fields.slice(0, index + 1), field, ...fields.slice(index + 1)];
}

/**
 * 差分操作を1つ適用する。入力やフィールド単体の妥当性はここで検証し、
 * id の一意性・showIf の参照整合性などフォーム全体の検証は validateForm に任せる。
 */
export function applyOp(form: Form, name: string, input: unknown): ApplyResult {
  if (!(name in formOps)) return { ok: false, error: `未知の操作です: ${name}` };
  const parsed = v.safeParse(formOps[name as FormOpName], input);
  if (!parsed.success) return { ok: false, error: `入力が不正です: ${issuesToString(parsed.issues)}` };

  switch (name as FormOpName) {
    case 'add_field': {
      const op = parsed.output as v.InferOutput<typeof AddFieldInputSchema>;
      if (indexOf(form, op.field.id) !== -1) return { ok: false, error: `id "${op.field.id}" は既に存在します` };
      const fields = insertAfter(form.fields, op.field, op.after);
      return typeof fields === 'string' ? { ok: false, error: fields } : { ok: true, form: { ...form, fields } };
    }
    case 'update_field': {
      const op = parsed.output as v.InferOutput<typeof UpdateFieldInputSchema>;
      const index = indexOf(form, op.id);
      if (index === -1) return { ok: false, error: `フィールド "${op.id}" が存在しません` };
      const next: Record<string, unknown> = { ...form.fields[index], ...op.set };
      for (const key of op.unset ?? []) delete next[key];
      const field = v.safeParse(FieldSchema, next);
      if (!field.success) return { ok: false, error: `更新後のフィールドが不正です: ${issuesToString(field.issues)}` };
      const fields = form.fields.with(index, field.output);
      return { ok: true, form: { ...form, fields } };
    }
    case 'remove_field': {
      const op = parsed.output as v.InferOutput<typeof RemoveFieldInputSchema>;
      if (indexOf(form, op.id) === -1) return { ok: false, error: `フィールド "${op.id}" が存在しません` };
      return { ok: true, form: { ...form, fields: form.fields.filter((field) => field.id !== op.id) } };
    }
    case 'move_field': {
      const op = parsed.output as v.InferOutput<typeof MoveFieldInputSchema>;
      const field = form.fields.find((f) => f.id === op.id);
      if (!field) return { ok: false, error: `フィールド "${op.id}" が存在しません` };
      if (op.after === op.id) return { ok: false, error: 'after に自分自身は指定できません' };
      const fields = insertAfter(form.fields.filter((f) => f.id !== op.id), field, op.after);
      return typeof fields === 'string' ? { ok: false, error: fields } : { ok: true, form: { ...form, fields } };
    }
    case 'update_form': {
      const op = parsed.output as v.InferOutput<typeof UpdateFormInputSchema>;
      const next: Form = { ...form };
      if (op.title !== undefined) next.title = op.title;
      if (op.description === null) delete next.description;
      else if (op.description !== undefined) next.description = op.description;
      return { ok: true, form: next };
    }
  }
}
