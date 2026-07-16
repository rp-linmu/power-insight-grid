import { NextRequest, NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const effectiveDate = request.nextUrl.searchParams.get("effective_date");
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }

  try {
    const response = await fetch(`${API_BASE}/api/trading/context?${query.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ status: "missing", status_label: "数据服务异常" }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ status: "missing", status_label: "数据服务未启动" }, { status: 503 });
  }
}
