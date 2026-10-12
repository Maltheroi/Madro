import { z } from "zod";
import { parseDanishNumber } from "@/lib/format";

/** Number field that accepts Danish decimal commas from form inputs. */
export const danishNumber = (opts: { min: number; max: number; label: string }) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : parseDanishNumber(v)) : v),
    z
      .number({ error: `Angiv ${opts.label}.` })
      .refine(Number.isFinite, `Angiv ${opts.label} som et tal.`)
      .refine((n) => n >= opts.min && n <= opts.max, `${opts.label[0].toUpperCase()}${opts.label.slice(1)} skal være mellem ${opts.min} og ${opts.max}.`),
  );

export const optionalDanishNumber = (opts: { min: number; max: number; label: string }) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? parseDanishNumber(v) : v),
    z
      .number()
      .refine(Number.isFinite, `Angiv ${opts.label} som et tal.`)
      .refine((n) => n >= opts.min && n <= opts.max, `${opts.label[0].toUpperCase()}${opts.label.slice(1)} skal være mellem ${opts.min} og ${opts.max}.`)
      .optional(),
  );

export const uuid = z.uuid();

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ugyldig dato.");

/** Result type returned by every server action to forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
