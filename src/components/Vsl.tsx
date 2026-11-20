"use client";

import { useEffect, useRef, useState } from "react";

type Kind = { type: "youtube"; id: string } | { type: "vimeo"; id: string; hash?: string } | { type: "file"; src: string };
function parse(url: string): Kind {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { type: "youtube", id: yt[1] };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/);
  if (vm) return { type: "vimeo", id: vm[1], hash: vm[2] ?? new URL(url).searchParams.get("h") ?? undefined };
  return { type: "file", src: url };
}
const KEY = "liq_offer_open";

/**
 * The demo video. The offer section (children) stays hidden until the viewer reaches `revealAt` of the video,
 * then stays open on later visits. Works with YouTube, Vimeo, or a direct video file.
 */
export function Vsl({ url, revealAt, children }: { url: string; revealAt: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const kind = parse(url);

  const reveal = () => {
    if (opened.current) return;
    opened.current = true;
    setOpen(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    void fetch("/api/demo-offer", { method: "POST" }).catch(() => {});
  };
  const progress = (t: number, d: number) => { if (d > 0 && t / d >= revealAt) reveal(); };

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "1") { opened.current = true; setOpen(true); } } catch { /* ignore */ }
    if (kind.type === "youtube") {
      const w = window as any;
      let timer: ReturnType<typeof setInterval> | undefined;
      const make = () => {
        if (!box.current) return;
        const el = document.createElement("div");
        box.current.appendChild(el); // YouTube swaps this for its iframe; React's own node stays put
        const player = new w.YT.Player(el, { videoId: kind.id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
        timer = setInterval(() => { try { progress(player.getCurrentTime(), player.getDuration()); } catch { /* not ready */ } }, 1000);
      };
      if (w.YT?.Player) make();
      else {
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => { prev?.(); make(); };
        if (!document.querySelector("script[src*='youtube.com/iframe_api']")) {
          const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
        }
      }
      return () => clearInterval(timer);
    }
    if (kind.type === "vimeo") {
      const onMsg = (e: MessageEvent) => {
        if (!String(e.origin).includes("vimeo.com")) return;
        let m: any = e.data; try { if (typeof m === "string") m = JSON.parse(m); } catch { return; }
        const frame = box.current?.querySelector("iframe");
        if (m?.event === "ready" && frame?.contentWindow) {
          for (const ev of ["timeupdate", "playProgress"]) frame.contentWindow.postMessage(JSON.stringify({ method: "addEventListener", value: ev }), "*");
        }
        if ((m?.event === "timeupdate" || m?.event === "playProgress") && m.data) progress(m.data.seconds, m.data.duration);
      };
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <>
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#000", borderRadius: 12, overflow: "hidden" }}>
        <div ref={box} className="vsl-box" style={{ position: "absolute", inset: 0 }}>
          {kind.type === "vimeo" && (
            <iframe src={`https://player.vimeo.com/video/${kind.id}?${kind.hash ? `h=${kind.hash}&` : ""}api=1&dnt=1&title=0&byline=0&portrait=0`} style={{ width: "100%", height: "100%", border: 0 }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Demo video" />
          )}
          {kind.type === "file" && (
            <video src={kind.src} controls playsInline preload="metadata" style={{ width: "100%", height: "100%" }} onTimeUpdate={(e) => progress(e.currentTarget.currentTime, e.currentTarget.duration)} />
          )}
        </div>
      </div>
      {!open && <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}>Keep watching. Your options to get started appear below the video near the end of the demo.</p>}
      <div className={open ? "offer-in" : undefined} hidden={!open}>{children}</div>
    </>
  );
}
