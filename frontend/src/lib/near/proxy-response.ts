/** Fetch forbids a body on these statuses, including an empty ArrayBuffer. */
export async function proxyResponse(upstream: Response): Promise<Response> {
  const headers = new Headers(upstream.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  const body = [204, 205, 304].includes(upstream.status) ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers });
}
