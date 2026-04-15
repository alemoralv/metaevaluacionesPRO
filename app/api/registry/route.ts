import { NextRequest, NextResponse } from "next/server";
import { saveRegistryEntry, getRegistryEntriesByDate } from "@/lib/registry";
import type { EvaluationRegistryEntry } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const entry = (await req.json()) as EvaluationRegistryEntry;

    if (!entry || !entry.id || !entry.timestamp || !entry.reportContext) {
      return NextResponse.json({ error: "Invalid entry payload" }, { status: 400 });
    }

    await saveRegistryEntry(entry);
    return NextResponse.json({ ok: true, id: entry.id });
  } catch (err) {
    console.error("[registry] Error saving entry:", err);
    return NextResponse.json({ error: "Failed to save entry" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam =
      searchParams.get("date") ??
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

    const entries = await getRegistryEntriesByDate(dateParam);
    return NextResponse.json({ date: dateParam, count: entries.length, entries });
  } catch (err) {
    console.error("[registry] Error reading entries:", err);
    return NextResponse.json({ error: "Failed to read entries" }, { status: 500 });
  }
}
