import { Hono } from "hono";
import { ServiceStore } from "./store.ts";

export const publicProxy = new Hono();

publicProxy.get("/svc/:id/*path", async (c) => {
  const serviceId = c.req.param("id");
  const svc = await ServiceStore.getUnchecked(serviceId);
  if (!svc) return c.json({ error: "service not found" }, 404);
  if (svc.status !== "running") return c.json({ error: "service not running" }, 400);
  if (svc.mode !== "http") return c.json({ error: "service is not HTTP" }, 400);
  if (!svc.httpUrl) return c.json({ error: "service has no URL" }, 400);

  const path = c.req.param("path") || "";
  const qs = c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : "";
  const target = svc.httpUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "") + qs;

  try {
    const upstream = await fetch(target, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: ["GET", "HEAD"].includes(c.req.method) ? undefined : await c.req.text(),
    });
    const respHeaders = new Headers(upstream.headers);
    respHeaders.set("x-proxied-by", "lab-https-proxy");
    respHeaders.delete("content-encoding");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (e: any) {
    return c.json({ error: "proxy error: " + (e?.message ?? String(e)) }, 502);
  }
});
