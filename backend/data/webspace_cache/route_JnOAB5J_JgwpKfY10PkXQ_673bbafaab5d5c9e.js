// @bun
// data/webspace_cache/route_JnOAB5J_JgwpKfY10PkXQ.ts
var route_JnOAB5J_JgwpKfY10PkXQ_default = async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ echo: body, ts: Date.now(), path: c.req.path, method: c.req.method });
};
export {
  route_JnOAB5J_JgwpKfY10PkXQ_default as default
};
