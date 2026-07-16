import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: Request, context: { params: Promise<{ pageKey: string }> }) {
  const { pageKey } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/imports");
  const payload = new FormData();
  payload.set("folder_path", String(formData.get("folder_path") || ""));

  await fetch(`${API_BASE}/api/imports/targets/${pageKey}`, {
    method: "POST",
    body: payload,
    headers: {
      "X-Session-Token": token,
    },
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
