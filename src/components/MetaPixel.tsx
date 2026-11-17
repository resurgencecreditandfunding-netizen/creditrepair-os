import Script from "next/script";
import { headers } from "next/headers";
import { pixelId } from "@/lib/meta";

/**
 * The browser pixel, for the public sales and sign-up pages only. It records page views (to build audiences)
 * and sets Meta's own first-party cookies, which the server reads to match sign-ups and purchases.
 * It is never placed inside a client's account, and two settings keep it from following anyone there: disablePushState stops it
 * reporting in-app page changes, and autoConfig off stops it reading button clicks. Skipped when the browser sends Global Privacy Control.
 */
export async function MetaPixel({ audience }: { audience: "consumer" | "operator" }) {
  const id = pixelId();
  if (!id || !/^\d{5,20}$/.test(id) || (await headers()).get("sec-gpc") === "1") return null;
  const code = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq.disablePushState=true;fbq('set','autoConfig',false,'${id}');fbq('init','${id}');fbq('track','PageView');fbq('track','ViewContent',{content_category:'${audience}'});`;
  return <Script id="meta-pixel" strategy="afterInteractive">{code}</Script>;
}
