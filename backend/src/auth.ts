import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { dbGet } from "./db";

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
export function signToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "7d" });
}
export interface AuthedRequest extends Request {
  user?: { id: string; email: string; name: string };
}
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as any;
    const user = await dbGet(`SELECT id, name, email FROM users WHERE id = ?`, [payload.id]);
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
export function asyncHandler(fn: any) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}
