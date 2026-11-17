import { NextRequest, NextResponse } from "next/server";
import { SOURCE_COOKIE, SOURCE_DAYS, sourceFromUrl } from "@/lib/attribution";

/** Remembers which ad or tagged link brought a visitor, so the sign-up can be credited to it. */
export function middleware(req: NextRequest) {
  const src = sourceFromUrl(req.nextUrl);
  const res = NextResponse.next();
  if (src) res.cookies.set(SOURCE_COOKIE, JSON.stringify(src), { path: "/", maxAge: SOURCE_DAYS * 86400, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return res;
}

// Only the pages an ad or invite can land on.
export const config = { matcher: ["/", "/partners", "/start", "/console/signup"] };
