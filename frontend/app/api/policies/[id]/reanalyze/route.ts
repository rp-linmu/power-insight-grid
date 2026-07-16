import { cookies } from "next/headers";
import { NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = new URL(String(formData.get("returnTo") || "/policies"), request.url);

  const response = await fetch(`${API_BASE}/api/policies/${id}/reanalyze`, {
    method: "POST",
    headers: {
      "X-Session-Token": token,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = "触发 AI 解读失败";
    try {
      const body = await response.json();
      detail = String(body.detail || detail);
    } catch {}
    returnTo.searchParams.set("save", "error");
    returnTo.searchParams.set("message", detail);
    return NextResponse.redirect(returnTo);
  }

  returnTo.searchParams.set("save", "success");
  returnTo.searchParams.set("message", "AI 解读已生成。");
  return NextResponse.redirect(returnTo);
}
