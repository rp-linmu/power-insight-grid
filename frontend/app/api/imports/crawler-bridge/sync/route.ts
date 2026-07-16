import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/imports");
  const effectiveDate = String(formData.get("effective_date") || "");
  const query = new URLSearchParams();

  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  await fetch(`${API_BASE}/api/imports/crawler-bridge/sync${suffix}`, {
    method: "POST",
    headers: {
      "X-Session-Token": token,
    },
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
