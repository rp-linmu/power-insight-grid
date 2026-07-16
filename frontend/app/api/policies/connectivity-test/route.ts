import { cookies } from "next/headers";
import { NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const returnTo = new URL("/policies", request.url);

  const response = await fetch(`${API_BASE}/api/policies/connectivity-test`, {
    method: "POST",
    headers: {
      "X-Session-Token": token,
    },
    cache: "no-store",
  });

  let testMessage = "模型连通性测试失败。";
  let testStatus = "error";
  try {
    const body = await response.json();
    if (response.ok) {
      testStatus = body.ok ? "success" : "warn";
      testMessage = [body.summary, body.detail].filter(Boolean).join(" ");
    } else {
      testStatus = "error";
      testMessage = String(body.detail || testMessage);
    }
  } catch {
    testStatus = "error";
  }

  returnTo.searchParams.set("probe", testStatus);
  returnTo.searchParams.set("probeMessage", testMessage);
  return NextResponse.redirect(returnTo);
}
