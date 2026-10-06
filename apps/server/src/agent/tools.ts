import type Anthropic from '@anthropic-ai/sdk';
import {
  AddFieldInputSchema,
  formJsonSchema,
  MoveFieldInputSchema,
  RemoveFieldInputSchema,
  toToolInputSchema,
  UpdateFieldInputSchema,
  UpdateFormInputSchema,
} from '@app/schema';

type InputSchema = Anthropic.Beta.BetaTool.InputSchema;

export const renderFormTool: Anthropic.Beta.BetaTool = {
  name: 'render_form',
  description: 'フォーム定義の全体を出力し、画面にプレビューとして描画する。',
  input_schema: formJsonSchema() as InputSchema,
};

export const patchTools: Anthropic.Beta.BetaTool[] = [
  {
    name: 'add_field',
    description: 'フィールドを1つ追加する。after に既存フィールドの id を指定するとその直後に、null なら先頭に、省略すると末尾に追加する。',
    input_schema: toToolInputSchema(AddFieldInputSchema) as InputSchema,
  },
  {
    name: 'update_field',
    description: '既存フィールドのプロパティを変更する。set のプロパティで上書きし、unset に挙げたプロパティを削除する。type を変える場合は、新しい type に必要なプロパティも set に含める。',
    input_schema: toToolInputSchema(UpdateFieldInputSchema) as InputSchema,
  },
  {
    name: 'remove_field',
    description: 'フィールドを1つ削除する。',
    input_schema: toToolInputSchema(RemoveFieldInputSchema) as InputSchema,
  },
  {
    name: 'move_field',
    description: 'フィールドの位置を移動する。after に指定したフィールドの直後へ、null なら先頭へ移動する。',
    input_schema: toToolInputSchema(MoveFieldInputSchema) as InputSchema,
  },
  {
    name: 'update_form',
    description: 'フォームのタイトルや説明文を変更する。description に null を指定すると説明文を削除する。',
    input_schema: toToolInputSchema(UpdateFormInputSchema) as InputSchema,
  },
];
