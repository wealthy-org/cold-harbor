import { NextResponse } from "next/server";
import { fetchPrices } from "@/lib/prices";

export async function GET() {
  try {
    return NextResponse.json({ prices: await fetchPrices() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
