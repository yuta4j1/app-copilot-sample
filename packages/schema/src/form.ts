import * as v from 'valibot';

export const ShowIfSchema = v.object({
  field: v.pipe(v.string(), v.minLength(1)),
  op: v.picklist(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'includes']),
  value: v.union([v.string(), v.number(), v.boolean()]),
});

const base = {
  id: v.pipe(v.string(), v.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)),
  label: v.pipe(v.string(), v.minLength(1)),
  required: v.optional(v.boolean()),
  helpText: v.optional(v.string()),
  showIf: v.optional(ShowIfSchema),
};

const options = v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1));

export const FieldSchema = v.variant('type', [
  v.object({ ...base, type: v.literal('text'), placeholder: v.optional(v.string()), maxLength: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))) }),
  v.object({ ...base, type: v.literal('textarea'), placeholder: v.optional(v.string()), rows: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))) }),
  v.object({ ...base, type: v.literal('email'), placeholder: v.optional(v.string()) }),
  v.object({ ...base, type: v.literal('number'), min: v.optional(v.number()), max: v.optional(v.number()), step: v.optional(v.number()) }),
  v.object({ ...base, type: v.literal('date'), min: v.optional(v.string()), max: v.optional(v.string()) }),
  v.object({ ...base, type: v.literal('select'), options }),
  v.object({ ...base, type: v.literal('radio'), options }),
  v.object({ ...base, type: v.literal('checkbox'), options }),
]);

export const FormSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  description: v.optional(v.string()),
  fields: v.array(FieldSchema),
});

export type ShowIf = v.InferOutput<typeof ShowIfSchema>;
export type Field = v.InferOutput<typeof FieldSchema>;
export type FieldType = Field['type'];
export type Form = v.InferOutput<typeof FormSchema>;
