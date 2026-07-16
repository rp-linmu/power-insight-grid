import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value || "";
    const formData = await request.formData();
    const upstreamUrl = `${API_BASE}/api/policies/workspace/report`;
    const response = await fetchWithSingleRetry(upstreamUrl, formData, token);
    const contentType = response.headers.get("content-type") || "application/json";
    const text = await response.text();
    const bodyText = text.trim()
      ? text
      : JSON.stringify({
          detail: response.ok
            ? "服务返回空结果。"
            : `服务返回空响应（HTTP ${response.status} ${response.statusText || ""}）。`,
        });
    return new NextResponse(bodyText, {
      status: response.status,
      headers: { "content-type": bodyText === text ? contentType : "application/json" },
    });
  } catch (error) {
    const detail = formatFetchError(error);
    return NextResponse.json({ detail: `联动报告请求失败：${detail}` }, { status: 502 });
  }
}


async function fetchWithSingleRetry(url: string, formData: FormData, token: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          "X-Session-Token": token,
        },
        cache: "no-store",
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  throw lastError;
}


function formatFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return "未知网络错误";
  }
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const code = "code" in cause ? String((cause as { code?: unknown }).code || "") : "";
    const message = "message" in cause ? String((cause as { message?: unknown }).message || "") : "";
    const compact = [error.message, code, message].filter(Boolean).join(" | ");
    return compact || error.message;
  }
  return error.message;
}
