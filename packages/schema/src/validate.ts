import * as v from 'valibot';
import { FormSchema, type Form } from './form.ts';

export type ValidationResult =
  | { success: true; form: Form }
  | { success: false; errors: string[] };

/** スキーマ検証に加え、id の一意性と showIf の参照整合性(自己参照・循環なし)を検証する */
export function validateForm(input: unknown): ValidationResult {
  const parsed = v.safeParse(FormSchema, input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.issues.map((issue) => `${v.getDotPath(issue) ?? '(root)'}: ${issue.message}`),
    };
  }

  const form = parsed.output;
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const field of form.fields) {
    if (ids.has(field.id)) errors.push(`fields: id "${field.id}" が重複しています`);
    ids.add(field.id);
  }

  const deps = new Map<string, string>();
  for (const field of form.fields) {
    if (!field.showIf) continue;
    const target = field.showIf.field;
    if (target === field.id) errors.push(`${field.id}.showIf: 自分自身を参照しています`);
    else if (!ids.has(target)) errors.push(`${field.id}.showIf: 存在しないフィールド "${target}" を参照しています`);
    else deps.set(field.id, target);
  }

  for (const start of deps.keys()) {
    const seen = new Set([start]);
    let current = deps.get(start);
    while (current !== undefined) {
      if (current === start) {
        errors.push(`${start}.showIf: 循環参照があります (${[...seen, start].join(' -> ')})`);
        break;
      }
      if (seen.has(current)) break;
      seen.add(current);
      current = deps.get(current);
    }
  }

  return errors.length > 0 ? { success: false, errors } : { success: true, form };
}
