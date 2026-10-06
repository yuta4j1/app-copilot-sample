import type { Field, Form, ShowIf } from '@app/schema';
import { useState } from 'react';
import styles from './FormPreview.module.css';

type Values = Record<string, string | string[]>;

function isVisible(showIf: ShowIf | undefined, values: Values): boolean {
  if (!showIf) return true;
  const current = values[showIf.field];
  if (current === undefined || current === '' || (Array.isArray(current) && current.length === 0)) return false;

  if (showIf.op === 'includes') {
    return Array.isArray(current) ? current.includes(String(showIf.value)) : current.includes(String(showIf.value));
  }
  const actual = Array.isArray(current) ? current.join(',') : current;
  if (showIf.op === 'eq') return actual === String(showIf.value);
  if (showIf.op === 'neq') return actual !== String(showIf.value);

  const a = Number(actual);
  const b = Number(showIf.value);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  switch (showIf.op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
  }
}

export function FormPreview({ form }: { form: Form }) {
  const [values, setValues] = useState<Values>({});
  const set = (id: string, value: string | string[]) => setValues((prev) => ({ ...prev, [id]: value }));

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <h1 className={styles.title}>{form.title}</h1>
      {form.description && <p className={styles.description}>{form.description}</p>}
      {form.fields
        .filter((field) => isVisible(field.showIf, values))
        .map((field) => (
          <div key={field.id} className={styles.field}>
            {field.type === 'radio' || field.type === 'checkbox' ? (
              <fieldset className={styles.group}>
                <legend className={styles.label}>
                  {field.label}
                  {field.required && <span className={styles.required}>必須</span>}
                </legend>
                <FieldInput field={field} values={values} onChange={set} />
              </fieldset>
            ) : (
              <>
                <label htmlFor={field.id} className={styles.label}>
                  {field.label}
                  {field.required && <span className={styles.required}>必須</span>}
                </label>
                <FieldInput field={field} values={values} onChange={set} />
              </>
            )}
            {field.helpText && <p className={styles.help}>{field.helpText}</p>}
          </div>
        ))}
    </form>
  );
}

type InputProps = {
  field: Field;
  values: Values;
  onChange: (id: string, value: string | string[]) => void;
};

function FieldInput({ field, values, onChange }: InputProps) {
  const value = values[field.id];
  const text = typeof value === 'string' ? value : '';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea id={field.id} className={styles.input} rows={field.rows ?? 4} placeholder={field.placeholder}
          required={field.required} value={text} onChange={(e) => onChange(field.id, e.target.value)} />
      );
    case 'select':
      return (
        <select id={field.id} className={styles.input} required={field.required} value={text}
          onChange={(e) => onChange(field.id, e.target.value)}>
          <option value="">選択してください</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    case 'radio':
      return field.options.map((option) => (
        <label key={option} className={styles.choice}>
          <input type="radio" name={field.id} value={option} required={field.required}
            checked={text === option} onChange={() => onChange(field.id, option)} />
          {option}
        </label>
      ));
    case 'checkbox': {
      const checked = Array.isArray(value) ? value : [];
      return field.options.map((option) => (
        <label key={option} className={styles.choice}>
          <input type="checkbox" name={field.id} value={option} checked={checked.includes(option)}
            onChange={(e) => onChange(field.id, e.target.checked ? [...checked, option] : checked.filter((o) => o !== option))} />
          {option}
        </label>
      ));
    }
    case 'number':
      return (
        <input id={field.id} className={styles.input} type="number" min={field.min} max={field.max} step={field.step}
          required={field.required} value={text} onChange={(e) => onChange(field.id, e.target.value)} />
      );
    case 'date':
      return (
        <input id={field.id} className={styles.input} type="date" min={field.min} max={field.max}
          required={field.required} value={text} onChange={(e) => onChange(field.id, e.target.value)} />
      );
    case 'text':
    case 'email':
      return (
        <input id={field.id} className={styles.input} type={field.type} placeholder={field.placeholder}
          maxLength={field.type === 'text' ? field.maxLength : undefined}
          required={field.required} value={text} onChange={(e) => onChange(field.id, e.target.value)} />
      );
  }
}
