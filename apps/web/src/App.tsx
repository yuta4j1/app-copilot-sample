import type { Form } from '@app/schema';
import { useState } from 'react';
import { generate } from './api.ts';
import styles from './App.module.css';
import { ChatPane, type ChatMessage } from './components/ChatPane.tsx';
import { FormPreview } from './components/FormPreview.tsx';
import { JsonView } from './components/JsonView.tsx';

type Tab = 'preview' | 'json';

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [tab, setTab] = useState<Tab>('preview');

  const send = async (prompt: string) => {
    setMessages((prev) => [...prev, { role: 'user', text: prompt }]);
    setPending(true);
    try {
      const result = await generate({ prompt });
      if (result.type === 'form') {
        setForm(result.form);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: result.message ?? `「${result.form.title}」を生成しました。`, repairs: result.repairs },
        ]);
      } else if (result.type === 'invalid') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: '自動修正の上限に達しましたが、フォーム定義のバリデーションエラーが解消しませんでした。',
            errors: result.errors,
            repairs: result.repairs,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: result.message, repairs: result.repairs }]);
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
        <h2 className={styles.heading}>チャット</h2>
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
