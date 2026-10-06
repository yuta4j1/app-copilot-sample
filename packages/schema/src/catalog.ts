import type { FieldType } from './form.ts';

export type CatalogEntry = {
  type: FieldType;
  description: string;
  props: string[];
};

/** フィールド種別カタログ。システムプロンプトの生成に使う */
export const fieldCatalog: CatalogEntry[] = [
  { type: 'text', description: '1行テキスト', props: ['placeholder', 'maxLength'] },
  { type: 'textarea', description: '複数行テキスト', props: ['placeholder', 'rows'] },
  { type: 'email', description: 'メールアドレス', props: ['placeholder'] },
  { type: 'number', description: '数値', props: ['min', 'max', 'step'] },
  { type: 'date', description: '日付(YYYY-MM-DD)', props: ['min', 'max'] },
  { type: 'select', description: '単一選択(プルダウン)', props: ['options(必須)'] },
  { type: 'radio', description: '単一選択(ラジオ)', props: ['options(必須)'] },
  { type: 'checkbox', description: '複数選択', props: ['options(必須)'] },
];
