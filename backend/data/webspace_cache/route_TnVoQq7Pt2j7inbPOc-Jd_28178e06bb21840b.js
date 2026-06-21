// @bun
// data/webspace_cache/route_TnVoQq7Pt2j7inbPOc-Jd.ts
var route_TnVoQq7Pt2j7inbPOc_Jd_default = async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({ echo: body, ts: Date.now() });
};
export {
  route_TnVoQq7Pt2j7inbPOc_Jd_default as default
};
