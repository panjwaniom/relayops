import { Router } from "express";
import { z } from "zod";
import { asyncHandler, requireAuth } from "../auth";
import { suggestMappings, aiStatus } from "../ai";

const router = Router();
router.use(requireAuth);

router.get("/status", asyncHandler(async (_req: any, res: any) => {
  res.json({ ai: aiStatus() });
}));

router.post("/suggest-mapping", asyncHandler(async (req: any, res: any) => {
  const schema = z.object({ fields: z.array(z.string()).min(1).max(60) });
  const body = schema.parse(req.body);
  const result = await suggestMappings(body.fields);
  res.json(result);
}));

export default router;
