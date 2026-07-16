import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forward(request: Request, context: RouteContext) {
  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const target = `${API_BASE}/api/crawler/${path.join("/")}${incomingUrl.search}`;
  const body = request.method === "GET" ? undefined : await request.text();

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: body || undefined,
      cache: "no-store",
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json(
      { detail: "辅助决策后端未响应，请确认系统服务已启动。" },
      { status: 503 },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, context);
}
