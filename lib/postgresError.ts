export type PostgresErrorFields = {
  detail: string;
  code: string | null;
  hint: string | null;
  details: string | null;
};

export function formatPostgresError(error: unknown): PostgresErrorFields {
  if (!error || typeof error !== "object") {
    return {
      detail: String(error ?? "unknown_error"),
      code: null,
      hint: null,
      details: null,
    };
  }

  const row = error as {
    message?: string;
    code?: string;
    hint?: string;
    details?: string;
  };

  return {
    detail: String(row.message ?? "unknown_error"),
    code: row.code ?? null,
    hint: row.hint ?? null,
    details: row.details ?? null,
  };
}

export function postgresErrorBody(
  errorKey: string,
  error: unknown,
  extra?: Record<string, unknown>
) {
  const fields = formatPostgresError(error);

  return {
    ok: false,
    error: errorKey,
    ...fields,
    ...extra,
  };
}
