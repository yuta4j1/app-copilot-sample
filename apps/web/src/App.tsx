import type { EditMode, Form } from '@app/schema';
import { useState } from 'react';
import { generate } from './api.ts';
import styles from './App.module.css';
import { ChatPane, type ChatMessage } from './components/ChatPane.tsx';
import { FormPreview } from './components/FormPreview.tsx';
import { JsonView } from './components/JsonView.tsx';

type Tab = 'preview' | 'json';

const MODES: { value: EditMode; label: string }[] = [
  { value: 'regenerate', label: '全体再生成' },
  { value: 'patch', label: '差分ツール' },
];

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [mode, setMode] = useState<EditMode>('regenerate');
  const [tab, setTab] = useState<Tab>('preview');

  const send = async (prompt: string) => {
    const history = messages.map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, { role: 'user', text: prompt }]);
    setPending(true);
    try {
      const result = await generate({ prompt, mode, form, history });
      const { repairs, metrics } = result;
      if (result.type === 'form') {
        setForm(result.form);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: result.message ?? `「${result.form.title}」を反映しました。`, repairs, metrics },
        ]);
      } else if (result.type === 'invalid') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: '自動修正の上限に達しましたが、フォーム定義のバリデーションエラーが解消しませんでした。',
            errors: result.errors,
            repairs,
            metrics,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: result.message, repairs, metrics }]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: error instanceof Error ? error.message : String(error), errors: [] },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.layout}>
      <section className={styles.pane}>
        <div className={styles.header}>
          <h2 className={styles.heading}>チャット</h2>
          <div className={styles.modes} role="radiogroup" aria-label="編集方式">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                className={styles.mode}
                onClick={() => setMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <ChatPane messages={messages} pending={pending} onSend={send} />
      </section>
      <section className={styles.pane}>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={styles.tab} onClick={() => setTab('preview')}>
            プレビュー
          </button>
          <button type="button" role="tab" aria-selected={tab === 'json'} className={styles.tab} onClick={() => setTab('json')}>
            JSON
          </button>
        </div>
        {form === null ? (
          <p className={styles.empty}>左のチャットで作りたいフォームを伝えてください。</p>
        ) : tab === 'preview' ? (
          <FormPreview form={form} />
        ) : (
          <JsonView value={form} />
        )}
      </section>
    </div>
  );
}
