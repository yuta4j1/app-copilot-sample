import { describe, expect, it } from 'vitest';
import type { Form } from './form.ts';
import { applyOp } from './ops.ts';

const form: Form = {
  title: 'お問い合わせ',
  fields: [
    { id: 'name', type: 'text', label: 'お名前', required: true },
    { id: 'email', type: 'email', label: 'メールアドレス', required: true },
  ],
};

const ids = (result: ReturnType<typeof applyOp>) => (result.ok ? result.form.fields.map((f) => f.id) : result.error);

describe('applyOp', () => {
  it('add_field: 末尾・先頭・指定位置に追加する', () => {
    const field = { id: 'tel', type: 'text', label: '電話番号' };
    expect(ids(applyOp(form, 'add_field', { field }))).toEqual(['name', 'email', 'tel']);
    expect(ids(applyOp(form, 'add_field', { field, after: null }))).toEqual(['tel', 'name', 'email']);
    expect(ids(applyOp(form, 'add_field', { field, after: 'name' }))).toEqual(['name', 'tel', 'email']);
  });

  it('add_field: id の重複や不正なフィールドを拒否する', () => {
    expect(applyOp(form, 'add_field', { field: { id: 'name', type: 'text', label: 'x' } }).ok).toBe(false);
    expect(applyOp(form, 'add_field', { field: { id: 'x', type: 'radio', label: 'x', options: [] } }).ok).toBe(false);
  });

  it('update_field: プロパティを上書き・削除する', () => {
    const result = applyOp(form, 'update_field', { id: 'email', set: { label: 'メール' }, unset: ['required'] });
    expect(result.ok && result.form.fields[1]).toEqual({ id: 'email', type: 'email', label: 'メール' });
  });

  it('update_field: type 変更で必須プロパティが欠けるとエラーにする', () => {
    expect(applyOp(form, 'update_field', { id: 'name', set: { type: 'select' } }).ok).toBe(false);
    const ok = applyOp(form, 'update_field', { id: 'name', set: { type: 'select', options: ['A'] } });
    expect(ok.ok).toBe(true);
  });

  it('remove_field / move_field', () => {
    expect(ids(applyOp(form, 'remove_field', { id: 'name' }))).toEqual(['email']);
    expect(ids(applyOp(form, 'move_field', { id: 'email', after: null }))).toEqual(['email', 'name']);
    expect(applyOp(form, 'move_field', { id: 'nope', after: null }).ok).toBe(false);
  });

  it('update_form: タイトルと説明文を更新・削除する', () => {
    const updated = applyOp(form, 'update_form', { title: '問い合わせ', description: '説明' });
    expect(updated.ok && updated.form).toMatchObject({ title: '問い合わせ', description: '説明' });
    const removed = applyOp({ ...form, description: 'x' }, 'update_form', { description: null });
    expect(removed.ok && 'description' in removed.form).toBe(false);
  });

  it('未知の操作を拒否する', () => {
    expect(applyOp(form, 'rename_all', {}).ok).toBe(false);
  });
});
