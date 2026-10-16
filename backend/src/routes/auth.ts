import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { dbAll, dbGet, dbRun } from "../db";
import { asyncHandler, requireAuth, signToken, hashPassword, verifyPassword } from "../auth";

const router = Router();

router.post("/register", asyncHandler(async (req: any, res: any) => {
  const schema = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6) });
  const body = schema.parse(req.body);
  const existing = await dbGet(`SELECT id FROM users WHERE email = ?`, [body.email.toLowerCase()]);
  if (existing) return res.status(400).json({ error: "Email already registered" });
  const id = randomUUID();
  await dbRun(`INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)`, [
    id, body.name, body.email.toLowerCase(), await hashPassword(body.password), new Date().toISOString(),
  ]);
  const token = signToken({ id, email: body.email.toLowerCase(), name: body.name });
  res.json({ token, user: { id, name: body.name, email: body.email.toLowerCase() } });
}));

router.post("/login", asyncHandler(async (req: any, res: any) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const body = schema.parse(req.body);
  const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [body.email.toLowerCase()]);
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = signToken({ id: user.id, name: user.name, email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
}));

router.get("/me", requireAuth, asyncHandler(async (req: any, res: any) => {
  res.json({ user: req.user });
}));

export default router;
