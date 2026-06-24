/**
 * Shared Hono environment types for the lab API.
 * Use this in every sub-app: `new Hono<HonoEnv>()`.
 */
export type HonoEnv = {
  Variables: {
    userId: string;
  };
};
