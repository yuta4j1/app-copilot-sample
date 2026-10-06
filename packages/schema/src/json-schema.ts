import { toJsonSchema } from '@valibot/to-json-schema';
import type * as v from 'valibot';
import { FormSchema } from './form.ts';

type AnySchema = v.GenericSchema;

/** Tool Use の input_schema に渡す JSON Schema(メタ情報の $schema は除く) */
export function toToolInputSchema(schema: AnySchema) {
  const { $schema: _, ...rest } = toJsonSchema(schema);
  return rest;
}

/** フォーム定義の JSON Schema */
export const formJsonSchema = () => toToolInputSchema(FormSchema);
