import { useState } from 'react';
import styles from './JsonView.module.css';

export function JsonView({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(value, null, 2);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={styles.wrapper}>
      <button type="button" className={styles.copy} onClick={copy}>
        {copied ? 'コピーしました' : 'コピー'}
      </button>
      <pre className={styles.code}>{json}</pre>
    </div>
  );
}
