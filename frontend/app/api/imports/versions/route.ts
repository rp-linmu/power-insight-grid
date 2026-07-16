import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/imports");
  const payload = new FormData();
  payload.set("page_key", String(formData.get("page_key") || ""));
  payload.set("effective_date", String(formData.get("effective_date") || ""));
  payload.set("version_tag", String(formData.get("version_tag") || "当前版本"));
  payload.set("owner", String(formData.get("owner") || "系统导入"));

  await fetch(`${API_BASE}/api/imports/versions`, {
    method: "POST",
    body: payload,
    headers: {
      "X-Session-Token": token,
    },
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
