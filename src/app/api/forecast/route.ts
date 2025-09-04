import { NextRequest } from "next/server";
import { z } from "zod";
import { autoForecast } from "@/lib/forecast";

const PayloadSchema = z.object({
  datesISO: z.array(z.string().min(1)),
  values: z.array(z.number()),
  horizon: z.number().int().min(1).max(365),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PayloadSchema.parse(body);
    const { datesISO, values, horizon } = parsed;
    if (datesISO.length !== values.length) {
      return Response.json({ error: "datesISO and values length mismatch" }, { status: 400 });
    }
    const result = autoForecast(values, datesISO, horizon);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 400 });
  }
}


