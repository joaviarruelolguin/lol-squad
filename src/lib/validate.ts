/**
 * Validación de input para los endpoints POST.
 *
 * Sin esto, un request malformado puede:
 *  - Romper el código con `undefined.map(...)` o similar
 *  - Inyectar basura en la base (nombres de 10.000 caracteres)
 *  - Gastar cuota de Riot con datos basura
 *
 * Todas las funciones son puras y devuelven un error en español listo para
 * mandar al cliente.
 */

export interface ValidationError {
  ok: false;
  error: string;
  status: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | ValidationError;

function fail(error: string, status = 400): ValidationError {
  return { ok: false, error, status };
}

/** Parsea el body del request a JSON con manejo de errores */
export async function readJson(req: Request): Promise<ValidationResult<any>> {
  try {
    const text = await req.text();
    if (!text) return fail('El body del request está vacío.');
    // Límite de tamaño: los requests legítimos son todos chicos
    if (text.length > 200_000) {
      return fail('El request es demasiado grande.', 413);
    }
    const json = JSON.parse(text);
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return fail('El body debe ser un objeto JSON.');
    }
    return { ok: true, value: json };
  } catch {
    return fail('El body no es un JSON válido.');
  }
}

/** String no vacío, con longitud máxima y sin caracteres de control */
export function requireString(
  value: unknown,
  field: string,
  { max = 200, min = 1 }: { max?: number; min?: number } = {}
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return fail(`\`${field}\` debe ser un texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return fail(`\`${field}\` no puede estar vacío.`);
  }
  if (trimmed.length > max) {
    return fail(`\`${field}\` es demasiado largo (máx. ${max} caracteres).`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return fail(`\`${field}\` contiene caracteres no válidos.`);
  }
  return { ok: true, value: trimmed };
}

/** String opcional: si viene, se valida como string */
export function optionalString(
  value: unknown,
  field: string,
  opts: { max?: number } = {}
): ValidationResult<string | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  const r = requireString(value, field, opts);
  return r.ok ? { ok: true, value: r.value } : r;
}

/** Array de strings, con límite de cantidad y de longitud */
export function requireStringArray(
  value: unknown,
  field: string,
  { maxItems = 50, maxLen = 120 }: { maxItems?: number; maxLen?: number } = {}
): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return fail(`\`${field}\` debe ser una lista.`);
  }
  if (value.length > maxItems) {
    return fail(`\`${field}\` tiene demasiados elementos (máx. ${maxItems}).`);
  }
  const out: string[] = [];
  for (const item of value) {
    const r = requireString(item, `${field}[]`, { max: maxLen });
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

/** Número entero dentro de un rango */
export function optionalNumber(
  value: unknown,
  field: string,
  { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {}
): ValidationResult<number | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fail(`\`${field}\` debe ser un número.`);
  }
  const int = Math.trunc(num);
  if (int < min || int > max) {
    return fail(`\`${field}\` debe estar entre ${min} y ${max}.`);
  }
  return { ok: true, value: int };
}

/** Valor que debe ser uno de una lista cerrada */
export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[]
): ValidationResult<T> {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return fail(
      `\`${field}\` debe ser uno de: ${allowed.join(', ')}.`
    );
  }
  return { ok: true, value: value as T };
}

/** Parsea el body de una ruta y devuelve un NextResponse si falló */
export function validationErrorResponse(err: ValidationError): Response {
  return new Response(
    JSON.stringify({ error: err.error, errorType: 'VALIDATION_ERROR' }),
    { status: err.status, headers: { 'Content-Type': 'application/json' } }
  );
}