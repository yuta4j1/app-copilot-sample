import type { Metrics } from '@app/schema';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import styles from './ChatPane.module.css';

export type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  /** バリデーションエラーなど。空配列はエラー表示のみ */
  errors?: string[];
  /** 自動修正の前に失敗した各試行のエラー */
  repairs?: string[][];
  /** 計測値 */
  metrics?: Metrics;
};

const formatMetrics = (m: Metrics) => {
  const tools = Object.entries(m.toolCalls).map(([name, count]) => `${name}×${count}`);
  return [
    ...(tools.length > 0 ? [tools.join(', ')] : []),
    `API ${m.apiCalls}回`,
    `入力 ${m.inputTokens.toLocaleString()} / 出力 ${m.outputTokens.toLocaleString()} tokens`,
    `${(m.durationMs / 1000).toFixed(1)}秒`,
  ].join(' · ');
};

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  onSend: (prompt: string) => void;
};

export function ChatPane({ messages, pending, onSend }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = input.trim();
    if (!prompt || pending) return;
    onSend(prompt);
    setInput('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
  };

  return (
    <div className={styles.chat}>
      <ul className={styles.messages}>
        {messages.map((message, i) => (
          <li key={i} className={message.role === 'user' ? styles.user : styles.assistant} data-error={message.errors !== undefined}>
            <p className={styles.text}>{message.text}</p>
            {message.errors && message.errors.length > 0 && (
              <ul className={styles.errors}>
                {message.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {message.repairs && message.repairs.length > 0 && (
              <details className={styles.repairs}>
                <summary>差し戻し {message.repairs.length} 回</summary>
                <ol>
                  {message.repairs.map((errors, i) => (
                    <li key={i}>
                      <ul className={styles.errors}>
                        {errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {message.metrics && <p className={styles.metrics}>{formatMetrics(message.metrics)}</p>}
          </li>
        ))}
        {pending && <li className={styles.assistant}>生成中…</li>}
      </ul>
      <div ref={bottomRef} />
      <form className={styles.composer} onSubmit={submit}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="例: 名前、メールアドレス、参加希望日(3択)を入力するイベント申込フォームを作って"
          rows={3}
        />
        <button type="submit" className={styles.send} disabled={pending || !input.trim()}>
          送信 <kbd>⌘↵</kbd>
        </button>
      </form>
    </div>
  );
}
