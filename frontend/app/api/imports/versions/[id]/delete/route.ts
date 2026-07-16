import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const cookieStore = await cookies();
  const token = cookieStore.get("portal_session")?.value || "";
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/imports");

  await fetch(`${API_BASE}/api/imports/versions/${id}`, {
    method: "DELETE",
    headers: {
      "X-Session-Token": token,
    },
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
