export default async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ echo: body, ts: Date.now(), path: c.req.path, method: c.req.method });
};
