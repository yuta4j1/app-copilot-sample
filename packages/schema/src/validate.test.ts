import { describe, expect, it } from 'vitest';
import { validateForm } from './validate.ts';

const valid = {
  title: 'イベント申込フォーム',
  fields: [
    { id: 'name', type: 'text', label: 'お名前', required: true },
    { id: 'age', type: 'number', label: '年齢', min: 0 },
    { id: 'guardian', type: 'text', label: '保護者氏名', showIf: { field: 'age', op: 'lt', value: 20 } },
    { id: 'date', type: 'select', label: '参加希望日', options: ['10/20', '10/21'] },
  ],
};

describe('validateForm', () => {
  it('正しいフォームを受け入れる', () => {
    expect(validateForm(valid).success).toBe(true);
  });

  it('未知の type を拒否する', () => {
    const result = validateForm({ title: 't', fields: [{ id: 'a', type: 'color', label: 'A' }] });
    expect(result.success).toBe(false);
  });

  it('選択系で options が空なら拒否する', () => {
    const result = validateForm({ title: 't', fields: [{ id: 'a', type: 'radio', label: 'A', options: [] }] });
    expect(result.success).toBe(false);
  });

  it('id の重複を検出する', () => {
    const result = validateForm({
      title: 't',
      fields: [
        { id: 'a', type: 'text', label: 'A' },
        { id: 'a', type: 'email', label: 'B' },
      ],
    });
    expect(result).toEqual({ success: false, errors: ['fields: id "a" が重複しています'] });
  });

  it('存在しない参照・自己参照・循環参照を検出する', () => {
    const missing = validateForm({ title: 't', fields: [{ id: 'a', type: 'text', label: 'A', showIf: { field: 'x', op: 'eq', value: 1 } }] });
    const self = validateForm({ title: 't', fields: [{ id: 'a', type: 'text', label: 'A', showIf: { field: 'a', op: 'eq', value: 1 } }] });
    const cycle = validateForm({
      title: 't',
      fields: [
        { id: 'a', type: 'text', label: 'A', showIf: { field: 'b', op: 'eq', value: 'x' } },
        { id: 'b', type: 'text', label: 'B', showIf: { field: 'a', op: 'eq', value: 'y' } },
      ],
    });
    expect(missing.success).toBe(false);
    expect(self.success).toBe(false);
    expect(cycle.success).toBe(false);
  });
});
