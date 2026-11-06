import { NextRequest } from "next/server";

const backend = process.env.NEAR_BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080";
const allowedMethods = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  if (!allowedMethods.has(request.method)) return Response.json({ error: "Method not allowed." }, { status: 405 });
  const { path } = await params;
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]) headers.delete(name);

  try {
    const upstream = await fetch(`${backend.replace(/\/$/, "")}/v1/${encodedPath}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: "NEAR merchant API is unreachable." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
