import { NextResponse } from "next/server";


const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";


export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${API_BASE}/api/policies/${id}/download`, {
    cache: "no-store",
  });
  const blob = await response.arrayBuffer();
  const headers = new Headers();
  headers.set("content-type", response.headers.get("content-type") || "application/pdf");
  const disposition = response.headers.get("content-disposition");
  if (disposition) {
    headers.set("content-disposition", disposition);
  }
  return new NextResponse(blob, { status: response.status, headers });
}
