import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { exportPersonalData } from "@/server/services/account";
import { RateLimitError } from "@/server/services/rate-limit";
import { logError, logEvent } from "@/lib/observability/log";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
  try {
    const data = await exportPersonalData(user);
    logEvent("account.exported");
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="mine-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof RateLimitError)
      return NextResponse.json({ error: e.message }, { status: 429 });
    logError("account.export_failed", e);
    return NextResponse.json({ error: "Eksporten mislykkedes." }, { status: 500 });
  }
}
