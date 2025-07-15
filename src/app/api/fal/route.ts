import { route } from "@fal-ai/server-proxy/nextjs";
import { NextRequest } from "next/server";
import {
  createRateLimiter,
  RateLimiter,
  shouldLimitRequest,
} from "@/lib/ratelimit";
import { checkBotId } from "botid/server";

const limiter: RateLimiter = {
  perMinute: createRateLimiter(10, "60 s"),
  perHour: createRateLimiter(30, "60 m"),
  perDay: createRateLimiter(100, "24 h"),
};

export const POST = async (req: NextRequest) => {
  // Check for bot activity first
  const verification = await checkBotId();
  if (verification.isBot) {
    return new Response("Access denied", { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for") || "";
  const limiterResult = await shouldLimitRequest(limiter, ip);
  if (limiterResult.shouldLimitRequest) {
    return new Response(`Rate limit exceeded per ${limiterResult.period}`, {
      status: 429,
    });
  }
  return route.POST(req);
};

export const { GET, PUT } = route;
