import { useCallback, useEffect, useRef, useState } from "react";
import type { RemotePeer } from "./useCall";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FPS = 30;

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

interface Tile {
  id: string;
  label: string;
  stream: MediaStream | null;
}

export function useRecorder(params: {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  displayName: string;
  peers: RemotePeer[];
  onRecordingChange?: (recording: boolean) => void;
}) {
  const { localStream, screenStream, displayName, peers, onRecordingChange } = params;
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [supported] = useState(
    () => pickMimeType() !== null && typeof HTMLCanvasElement.prototype.captureStream === "function",
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("video/webm");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  const tilesRef = useRef<Tile[]>([]);
  useEffect(() => {
    const tiles: Tile[] = [{ id: "self", label: displayName, stream: screenStream ?? localStream }];
    for (const p of peers) {
      tiles.push({ id: p.id, label: p.name ?? "Guest", stream: p.screenStream ?? p.stream });
    }
    tilesRef.current = tiles;
  }, [localStream, screenStream, displayName, peers]);

  // Keep a hidden <video> element playing for every stream currently being
  // composited — canvas drawImage needs a real playing element, not a bare
  // MediaStream.
  const getVideoEl = useCallback((key: string, stream: MediaStream | null): HTMLVideoElement | null => {
    if (!stream) {
      videoElsRef.current.delete(key);
      return null;
    }
    let el = videoElsRef.current.get(key);
    if (!el) {
      el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      videoElsRef.current.set(key, el);
    }
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    }
    return el;
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.fillStyle = "#101512";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const tiles = tilesRef.current;
    const cols = Math.max(1, Math.ceil(Math.sqrt(tiles.length)));
    const rows = Math.max(1, Math.ceil(tiles.length / cols));
    const cellW = CANVAS_WIDTH / cols;
    const cellH = CANVAS_HEIGHT / rows;

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW;
      const y = row * cellH;

      const video = getVideoEl(tile.id, tile.stream);
      if (video && video.videoWidth > 0) {
        // Cover-fit crop, same idea as CSS object-fit: cover.
        const videoAspect = video.videoWidth / video.videoHeight;
        const cellAspect = cellW / cellH;
        let sx = 0;
        let sy = 0;
        let sw = video.videoWidth;
        let sh = video.videoHeight;
        if (videoAspect > cellAspect) {
          sw = video.videoHeight * cellAspect;
          sx = (video.videoWidth - sw) / 2;
        } else {
          sh = video.videoWidth / cellAspect;
          sy = (video.videoHeight - sh) / 2;
        }
        ctx.drawImage(video, sx, sy, sw, sh, x, y, cellW, cellH);
      } else {
        ctx.fillStyle = "#161d1a";
        ctx.fillRect(x, y, cellW, cellH);
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(x + 8, y + cellH - 30, ctx.measureText(tile.label).width + 16, 22);
      ctx.fillStyle = "#ffffff";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(tile.label, x + 16, y + cellH - 14);
      ctx.strokeStyle = "#101512";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);
    });

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [getVideoEl]);

  // Keep the audio mix in sync with who's actually in the call while
  // recording is live, not just a snapshot from when it started.
  useEffect(() => {
    if (!isRecording || !audioCtxRef.current || !audioDestRef.current) return;
    const ctx = audioCtxRef.current;
    const dest = audioDestRef.current;
    const wanted = new Map<string, MediaStream>();
    if (localStream) wanted.set("self", localStream);
    for (const p of peers) wanted.set(p.id, p.stream);

    for (const [key, source] of audioSourcesRef.current) {
      if (!wanted.has(key)) {
        source.disconnect();
        audioSourcesRef.current.delete(key);
      }
    }
    for (const [key, stream] of wanted) {
      if (audioSourcesRef.current.has(key) || stream.getAudioTracks().length === 0) continue;
      try {
        const source = ctx.createMediaStreamSource(stream);
        source.connect(dest);
        audioSourcesRef.current.set(key, source);
      } catch {
        // Stream had no audio tracks yet, or the browser rejected it — skip.
      }
    }
  }, [isRecording, localStream, peers]);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    for (const source of audioSourcesRef.current.values()) source.disconnect();
    audioSourcesRef.current.clear();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    audioDestRef.current = null;
    videoElsRef.current.clear();
    canvasRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const startRecording = useCallback(() => {
    if (!supported || isRecording) return;
    const mimeType = pickMimeType();
    if (!mimeType) return;
    mimeTypeRef.current = mimeType;

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    canvasRef.current = canvas;

    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    audioCtxRef.current = audioCtx;
    audioDestRef.current = dest;

    const canvasStream = canvas.captureStream(FPS);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);

    const recorder = new MediaRecorder(combined, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      const url = URL.createObjectURL(blob);
      const ext = mimeTypeRef.current.includes("mp4") ? "mp4" : "webm";
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsly-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      cleanup();
      setIsRecording(false);
      setSeconds(0);
      onRecordingChange?.(false);
    };

    recorderRef.current = recorder;
    recorder.start(1000);
    rafRef.current = requestAnimationFrame(drawFrame);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setIsRecording(true);
    onRecordingChange?.(true);
  }, [supported, isRecording, drawFrame, cleanup, onRecordingChange]);

  const toggleRecording = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  // Stop cleanly if the component unmounts (e.g. leaving the call) mid-recording.
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isRecording, seconds, supported, toggleRecording };
}
