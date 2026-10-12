/**
 * Structured server logging. Never pass personal or health data (weights,
 * intake, allergies, emails, free text) as metadata: only event names,
 * error codes, counts and durations. Output is JSON lines on stdout so the
 * hosting platform's log drain can collect it.
 */
type Meta = Record<string, string | number | boolean | null | undefined>;

export function logEvent(event: string, meta: Meta = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...meta, ts: new Date().toISOString() }));
}

export function logError(event: string, error: unknown, meta: Meta = {}): void {
  const e = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  console.error(JSON.stringify({ level: "error", event, ...e, ...meta, ts: new Date().toISOString() }));
}
