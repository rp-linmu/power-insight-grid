import { NextRequest, NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await request.formData();
  const response = await fetch(`${API_BASE}/api/policies/${id}/chat`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "application/json";
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "content-type": contentType },
  });
}
