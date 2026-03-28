type JsonLike = Record<string, unknown>;

export function logServerError(
  scope: string,
  error: unknown,
  context: JsonLike = {},
) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(
    JSON.stringify({
      level: "error",
      scope,
      message,
      context,
      stack,
      timestamp: new Date().toISOString(),
    }),
  );
}
