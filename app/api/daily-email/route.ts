import { NextRequest, NextResponse } from "next/server";
import { getRegistryEntriesByDate } from "@/lib/registry";
import { sendDailyDigestEmail } from "@/lib/mailer";

export const runtime = "nodejs";

/**
 * POST /api/daily-email
 * Manually triggers the daily digest email (for testing).
 * Optional body: { "date": "YYYY-MM-DD" } — defaults to today in Mexico City time.
 */
export async function POST(req: NextRequest) {
  try {
    let dateParam: string;
    try {
      const body = await req.json();
      dateParam = body?.date ?? null;
    } catch {
      dateParam = "";
    }

    if (!dateParam) {
      dateParam = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Mexico_City",
      });
    }

    const entries = await getRegistryEntriesByDate(dateParam);
    await sendDailyDigestEmail(entries);

    return NextResponse.json({
      ok: true,
      date: dateParam,
      evaluationCount: entries.length,
      message: `Correo diario enviado con ${entries.length} evaluacion(es) del ${dateParam}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[daily-email] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
