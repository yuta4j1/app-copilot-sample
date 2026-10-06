import { toJsonSchema } from '@valibot/to-json-schema';
import { FormSchema } from './form.ts';

/** Tool Use の input_schema に渡すフォーム定義の JSON Schema */
export const formJsonSchema = () => toJsonSchema(FormSchema);
