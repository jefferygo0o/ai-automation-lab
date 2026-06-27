/**
 * nip.io Reverse Proxy — routes `*.nip.io` requests to local services.
 *
 * When a request comes in with Host header like `myapp.127-0-0-1.nip.io`,
 * we look up the corresponding service by domain in the custom_domains table
 * and proxy the request to localhost:<service_port>.
 *
 * This runs as a separate HTTP service on the configured NIP_PROXY_PORT (default 8888)
 * and auto-starts with the lab.
 */
import { Hono } from "hono";
import { db } from "../db/index.ts";

const proxy = new Hono();

/** Extract the subdomain from a nip.io Host header.
 *  e.g. "myapp.127-0-0-1.nip.io" → "myapp.127-0-0-1.nip.io"
 *  We match the full host against custom_domains.
 */
proxy.use("*", async (c) => {
  const host = c.req.header("host") || "";
  
  // Look up the domain in custom_domains
  const row = await db.prepare(
    "SELECT d.domain, s.local_port, s.mode FROM custom_domains d INNER JOIN user_services s ON s.id = d.service_id WHERE d.domain = ? AND s.status = 'running'"
  ).get(host) as { domain: string; local_port: number; mode: string } | undefined;

  if (!row) {
    return c.text(`No service found for domain: ${host}`, 404);
  }

  if (row.mode !== "http") {
    return c.text(`Service at ${host} is not an HTTP service`, 400);
  }

  // Proxy the request to localhost:<port>
  const pathAndQuery = c.req.path + (new URL(c.req.url).search || "");
  const targetUrl = `http://127.0.0.1:${row.local_port}${pathAndQuery}`;
  
  try {
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    
    const resp = await fetch(targetUrl, {
      method: c.req.method as any,
      headers,
      body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.raw.clone().text(),
    });

    // Forward the response back
    const respHeaders = new Headers(resp.headers);
    respHeaders.set("x-proxied-by", "lab-nip-proxy");
    
    return new Response(resp.body, {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (e: any) {
    return c.text(`Proxy error: ${e?.message || "connection refused"}`, 502);
  }
});

export default proxy;
export { proxy as nipProxy };
