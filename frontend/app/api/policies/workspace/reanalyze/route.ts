import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value || "";
    const formData = await request.formData();
    const policyId = String(formData.get("policy_id") || "").trim();
    if (!/^\d+$/.test(policyId)) {
      return NextResponse.json({ status: "error", detail: "policy_id 参数无效。" }, { status: 400 });
    }

    const response = await fetch(`${API_BASE}/api/policies/${policyId}/reanalyze`, {
      method: "POST",
      headers: {
        "X-Session-Token": token,
      },
      cache: "no-store",
    });
    const text = await response.text();
    if (!text.trim()) {
      return NextResponse.json(
        {
          status: response.ok ? "ok" : "error",
          policy_id: Number(policyId),
          detail: response.ok
            ? "后端返回空结果。"
            : `后端返回空响应（HTTP ${response.status} ${response.statusText || ""}）。`,
        },
        { status: response.ok ? 200 : response.status }
      );
    }
    let payload: any = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text.slice(0, 240) };
    }
    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          policy_id: Number(policyId),
          detail: String(payload?.detail || `请求失败（HTTP ${response.status}）。`),
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: "ok",
      policy_id: Number(policyId),
      detail: String(payload?.status || "ok"),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "顺序重解读请求失败。";
    return NextResponse.json({ status: "error", detail: `顺序重解读请求失败：${detail}` }, { status: 502 });
  }
}
