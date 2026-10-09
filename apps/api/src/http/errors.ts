import { z, type ZodTypeAny } from 'zod';

/** Errors the API returns on purpose. Anything else becomes a generic 500 without internals. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'nao_autenticado', 'Sessão inexistente ou expirada. Entre novamente.');
export const forbidden = () => new HttpError(403, 'sem_permissao', 'Seu perfil não tem permissão para esta ação.');
export const notFound = (what = 'Registro') => new HttpError(404, 'nao_encontrado', `${what} não encontrado.`);
export const conflict = () => new HttpError(409, 'conflito_de_versao', 'Este registro foi alterado por outra pessoa. Recarregue e tente novamente.');

/** pt-BR validation messages. */
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' ? 'Campo obrigatório.' : 'Tipo de valor inválido.' };
    case z.ZodIssueCode.too_small:
      return { message: issue.type === 'string' ? `Informe ao menos ${issue.minimum} caractere(s).` : `Valor mínimo: ${issue.minimum}.` };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === 'string' ? `Informe no máximo ${issue.maximum} caracteres.` : `Valor máximo: ${issue.maximum}.` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido. Opções: ${issue.options.join(', ')}.` };
    case z.ZodIssueCode.unrecognized_keys:
      return { message: `Campo(s) não permitido(s): ${issue.keys.join(', ')}.` };
    case z.ZodIssueCode.invalid_string:
      return { message: 'Formato inválido.' };
    default:
      return { message: ctx.defaultError };
  }
};
z.setErrorMap(errorMap);

/** Validates input; unknown fields are rejected by `.strict()` schemas (no mass assignment). */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new HttpError(400, 'validacao', 'Dados inválidos. Revise os campos indicados.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
}
