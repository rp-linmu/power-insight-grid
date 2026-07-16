import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/policies");
  const payload = new FormData();
  payload.set("summary", String(formData.get("summary") || ""));
  payload.set("scope_summary", String(formData.get("scope_summary") || ""));
  payload.set("impact_summary", String(formData.get("impact_summary") || ""));
  payload.set("key_points_text", String(formData.get("key_points_text") || ""));
  payload.set("impact_tags_text", String(formData.get("impact_tags_text") || ""));

  const response = await fetch(`${API_BASE}/api/policies/${id}/edit`, {
    method: "POST",
    body: payload,
    headers: {
      "X-Session-Token": token,
    },
  });

  const redirectUrl = new URL(returnTo, request.url);
  if (!response.ok) {
    let detail = "保存失败";
    try {
      const body = await response.json();
      detail = String(body.detail || detail);
    } catch {}
    redirectUrl.searchParams.set("save", "error");
    redirectUrl.searchParams.set("message", detail);
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set("save", "success");
  return NextResponse.redirect(redirectUrl);
}
