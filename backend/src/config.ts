import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "relayops-dev-secret-change-me",
  isProduction: process.env.NODE_ENV === "production",
  jwtExpiresIn: "7d",
  databaseUrl: process.env.DATABASE_URL || "",
  redisUrl: process.env.REDIS_URL || "",
  aiApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "gpt-4o-mini",
  aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  usePostgres: Boolean(process.env.DATABASE_URL),
  useRedis: Boolean(process.env.REDIS_URL),
};
