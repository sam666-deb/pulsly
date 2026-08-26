import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useCall, type Reaction } from "../hooks/useCall";
import { useTheme } from "../hooks/useTheme";
import { useDisplayName } from "../hooks/useDisplayName";
import { useElementSize } from "../hooks/useElementSize";
import { useRecorder } from "../hooks/useRecorder";
import {
  MicIcon,
  CameraIcon,
  ScreenShareIcon,
  ChatIcon,
  LeaveIcon,
  SmileIcon,
  SunIcon,
  MoonIcon,
  PinIcon,
  RecordIcon,
} from "../components/icons";
import { Brand } from "../components/Logo";
import "./Room.css";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "👏"];
const GRID_GAP = 12; // px — keep in sync with .video-grid's `gap` in Room.css

function VideoTile({
  stream,
  muted,
  label,
  width,
  height,
  fill,
  fit = "cover",
  presenting,
  pinned,
  onTogglePin,
  small,
}: {
  stream: MediaStream | null;
  muted: boolean;
  label: string;
  width?: number;
  height?: number;
  fill?: boolean;
  fit?: "cover" | "contain";
  presenting?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  small?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  let className = small ? "video-tile video-tile-small" : "video-tile";
  if (fill) className += " video-tile-fill";

  return (
    <div className={className} style={!fill && width !== undefined ? { width, height } : undefined}>
      <video ref={ref} autoPlay playsInline muted={muted} style={{ objectFit: fit }} />
      {presenting && <span className="presenting-badge">Presenting</span>}
      <span className="video-label">{label}</span>
      {onTogglePin && (
        <button
          className={pinned ? "pin-button active" : "pin-button"}
          onClick={onTogglePin}
          title={pinned ? "Unpin" : "Pin to spotlight"}
          aria-label={pinned ? "Unpin" : "Pin to spotlight"}
        >
          <PinIcon />
        </button>
      )}
    </div>
  );
}

// Tile size that fills the measured container exactly for a `cols` x `rows`
// grid (so there's no wasted empty space), only pulled back from that
// natural fill if it would be an extreme sliver — narrower than 1:2 or
// wider than 2:1 — in which case it's capped at that ratio and centered
// with whatever margin is left, rather than distorted further.
function computeTileSize(
  containerWidth: number,
  containerHeight: number,
  cols: number,
  rows: number,
): { width: number; height: number } {
  const fallback = { width: 280, height: 210 };
  if (containerWidth <= 0 || containerHeight <= 0) return fallback;

  const MIN_ASPECT = 1 / 2;
  const MAX_ASPECT = 2;

  const naturalWidth = (containerWidth - (cols - 1) * GRID_GAP) / cols;
  const naturalHeight = (containerHeight - (rows - 1) * GRID_GAP) / rows;
  const naturalAspect = naturalWidth / naturalHeight;

  if (naturalAspect < MIN_ASPECT) {
    return { width: naturalWidth, height: naturalWidth / MIN_ASPECT };
  }
  if (naturalAspect > MAX_ASPECT) {
    return { width: naturalHeight * MAX_ASPECT, height: naturalHeight };
  }
  return { width: naturalWidth, height: naturalHeight };
}

function ReactionLayer({ reactions }: { reactions: Reaction[] }) {
  return (
    <div className="reaction-layer" aria-hidden="true">
      {reactions.map((r) => (
        <span key={r.id} className={r.self ? "floating-reaction self" : "floating-reaction"}>
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <main className="name-gate">
      <form
        className="name-gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <Brand size={30} />
        <h1>What should we call you?</h1>
        <p className="lede">Shown to the other person on the call.</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          autoFocus
          maxLength={30}
        />
        <button type="submit" className="primary" disabled={!value.trim()}>
          Join call
        </button>
      </form>
    </main>
  );
}

const STATUS_TEXT: Record<string, string> = {
  "requesting-media": "Asking for camera and microphone access…",
  connecting: "Connecting…",
  "waiting-for-peer": "Waiting for someone to join — share the link above.",
  negotiating: "Connecting…",
  "room-full": "This room is full.",
  "media-denied": "Camera or microphone access was denied.",
  error: "Something went wrong with the connection.",
};

const QUALITY_LABEL: Record<string, string> = {
  good: "Connection: good",
  fair: "Connection: fair",
  poor: "Connection: poor",
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function CallRoom({
  roomId,
  onLeave,
  displayName,
}: {
  roomId: string;
  onLeave: () => void;
  displayName: string;
}) {
  const {
    status,
    localStream,
    peers,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    screenStream,
    toggleScreenShare,
    messages,
    sendMessage,
    reactions,
    sendReaction,
    sendRecordingStatus,
    quality,
    connectedAt,
    leave,
  } = useCall(roomId, displayName);
  const { theme, toggleTheme } = useTheme();
  const {
    isRecording,
    seconds: recordingSeconds,
    supported: recordingSupported,
    toggleRecording,
  } = useRecorder({ localStream, screenStream, displayName, peers, onRecordingChange: sendRecordingStatus });
  const someoneElseRecording = peers.some((p) => p.recording);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const seenCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [gridRef, gridSize] = useElementSize<HTMLDivElement>();

  const shareLink = `${window.location.origin}/room/${roomId}`;
  const unread = chatOpen ? 0 : messages.length - seenCountRef.current;
  const elapsed = connectedAt ? formatElapsed(now - connectedAt) : null;

  const isSelfPresenting = !!screenStream;
  const presentingPeer = peers.find((p) => p.screenStream) ?? null;

  // A manual pin always wins; otherwise whoever is presenting (if anyone)
  // auto-takes the spotlight, exactly like Meet/Zoom.
  let spotlight: { id: string; stream: MediaStream | null; label: string; presenting: boolean } | null = null;
  if (pinnedId === "self") {
    spotlight = { id: "self", stream: screenStream ?? localStream, label: displayName, presenting: isSelfPresenting };
  } else if (pinnedId) {
    const p = peers.find((pp) => pp.id === pinnedId);
    if (p) {
      spotlight = {
        id: p.id,
        stream: p.screenStream ?? p.stream,
        label: p.name ?? "Guest",
        presenting: !!p.screenStream,
      };
    }
  }
  if (!spotlight) {
    if (isSelfPresenting) {
      spotlight = { id: "self", stream: screenStream, label: displayName, presenting: true };
    } else if (presentingPeer) {
      spotlight = {
        id: presentingPeer.id,
        stream: presentingPeer.screenStream,
        label: presentingPeer.name ?? "Guest",
        presenting: true,
      };
    }
  }

  const thumbnails: { id: string; stream: MediaStream | null; label: string }[] = [];
  if (spotlight) {
    if (spotlight.id !== "self") thumbnails.push({ id: "self", stream: localStream, label: displayName });
    for (const p of peers) {
      if (p.id !== spotlight.id) thumbnails.push({ id: p.id, stream: p.stream, label: p.name ?? "Guest" });
    }
  }

  const tileCount = peers.length + 1;
  const videoGridColumns = Math.max(1, Math.ceil(Math.sqrt(tileCount)));
  const videoGridRows = Math.max(1, Math.ceil(tileCount / videoGridColumns));
  const tileSize = computeTileSize(gridSize.width, gridSize.height, videoGridColumns, videoGridRows);

  // If the pinned person leaves the call, fall back to auto-spotlight/gallery
  // instead of leaving the pin pointed at nobody.
  useEffect(() => {
    if (pinnedId && pinnedId !== "self" && !peers.some((p) => p.id === pinnedId)) {
      setPinnedId(null);
    }
  }, [pinnedId, peers]);

  useEffect(() => {
    if (chatOpen) seenCountRef.current = messages.length;
  }, [chatOpen, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!connectedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connectedAt]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "m" || e.key === "M") toggleMic();
      else if (e.key === "v" || e.key === "V") toggleCamera();
      else if (e.key === "Escape") setChatOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMic, toggleCamera]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const hangUp = () => {
    leave();
    onLeave();
  };

  const submitMessage = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(draft);
    setDraft("");
  };

  const togglePin = (id: string) => setPinnedId((prev) => (prev === id ? null : id));

  let videoArea: ReactNode;
  if (spotlight) {
    videoArea = (
      <div className="spotlight-layout">
        <div className="spotlight-main">
          <VideoTile
            stream={spotlight.stream}
            muted={spotlight.id === "self"}
            label={spotlight.label}
            fill
            fit={spotlight.presenting ? "contain" : "cover"}
            presenting={spotlight.presenting}
            pinned={pinnedId === spotlight.id}
            onTogglePin={() => togglePin(spotlight!.id)}
          />
          <ReactionLayer reactions={reactions} />
        </div>
        <div className="spotlight-thumbs">
          {thumbnails.map((t) => (
            <VideoTile
              key={t.id}
              stream={t.stream}
              muted={t.id === "self"}
              label={t.label}
              small
              pinned={false}
              onTogglePin={() => togglePin(t.id)}
            />
          ))}
        </div>
      </div>
    );
  } else {
    videoArea = (
      <div className="video-grid" ref={gridRef}>
        <VideoTile
          stream={localStream}
          muted
          label={displayName}
          width={tileSize.width}
          height={tileSize.height}
          pinned={false}
          onTogglePin={() => togglePin("self")}
        />
        {peers.map((peer) => (
          <VideoTile
            key={peer.id}
            stream={peer.stream}
            muted={false}
            label={peer.name ?? "Guest"}
            width={tileSize.width}
            height={tileSize.height}
            pinned={false}
            onTogglePin={() => togglePin(peer.id)}
          />
        ))}
        <ReactionLayer reactions={reactions} />
      </div>
    );
  }

  return (
    <main className="room">
      <header className="room-bar">
        <Brand size={22} />
        <div className="room-bar-right">
          {isRecording && (
            <span className="rec-badge" title="Recording this call">
              <span className="rec-dot" />
              REC {formatElapsed(recordingSeconds * 1000)}
            </span>
          )}
          {!isRecording && someoneElseRecording && (
            <span className="rec-badge rec-badge-notice" title="Someone is recording this call">
              <span className="rec-dot" />
              Recording
            </span>
          )}
          {elapsed && (
            <span className="call-timer">
              {quality && (
                <span
                  className={`quality-dot quality-${quality}`}
                  title={QUALITY_LABEL[quality]}
                  aria-label={QUALITY_LABEL[quality]}
                />
              )}
              {elapsed}
            </span>
          )}
          <button
            className="theme-toggle theme-toggle-inline"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="room-code" onClick={copyLink}>
            <code>{roomId}</code>
            <span>{copied ? "Copied" : "Copy link"}</span>
          </button>
        </div>
      </header>

      <div className="room-main">
        {videoArea}

        {STATUS_TEXT[status] && (
          <div className="status-banner">
            <p>{STATUS_TEXT[status]}</p>
          </div>
        )}

        <div className="controls">
          <button
            className={micOn ? "control" : "control off"}
            onClick={toggleMic}
            disabled={!localStream}
            title={micOn ? "Mute (M)" : "Unmute (M)"}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            <MicIcon crossedOut={!micOn} />
          </button>
          <button
            className={cameraOn ? "control" : "control off"}
            onClick={toggleCamera}
            disabled={!localStream}
            title={cameraOn ? "Turn camera off (V)" : "Turn camera on (V)"}
            aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          >
            <CameraIcon crossedOut={!cameraOn} />
          </button>
          <button
            className={screenStream ? "control active" : "control"}
            onClick={toggleScreenShare}
            disabled={status !== "connected" && !screenStream}
            title={screenStream ? "Stop sharing your screen" : "Share your screen"}
            aria-label={screenStream ? "Stop sharing your screen" : "Share your screen"}
          >
            <ScreenShareIcon />
          </button>

          {recordingSupported && (
            <button
              className={isRecording ? "control recording" : "control"}
              onClick={toggleRecording}
              title={isRecording ? "Stop recording" : "Record this call"}
              aria-label={isRecording ? "Stop recording" : "Record this call"}
            >
              <RecordIcon active={isRecording} />
            </button>
          )}

          <button
            className={reactionPickerOpen ? "control active" : "control"}
            onClick={() => setReactionPickerOpen((v) => !v)}
            disabled={status !== "connected"}
            title="Send a reaction"
            aria-label="Send a reaction"
          >
            <SmileIcon />
          </button>

          <button
            className="control"
            onClick={() => setChatOpen((v) => !v)}
            title="Chat"
            aria-label="Toggle chat panel"
          >
            <ChatIcon />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <button className="control hang-up" onClick={hangUp} title="Leave call" aria-label="Leave call">
            <LeaveIcon />
          </button>
        </div>

        {reactionPickerOpen && (
          <div className="reaction-picker">
            {REACTION_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  sendReaction(emoji);
                  setReactionPickerOpen(false);
                }}
                aria-label={`Send ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {chatOpen && (
        <aside className="chat-panel">
          <div className="chat-header">
            <span>Chat</span>
            <button className="chat-close" onClick={() => setChatOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>
          <div className="chat-messages">
            {messages.length === 0 && <p className="chat-empty">No messages yet.</p>}
            {messages.map((m, i) => (
              <div key={i} className={m.self ? "chat-msg self" : "chat-msg"}>
                {!m.self && m.from && <span className="chat-msg-from">{m.from}</span>}
                {m.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <form className="chat-input-row" onSubmit={submitMessage}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message"
              aria-label="Chat message"
            />
            <button type="submit" disabled={!draft.trim()}>
              Send
            </button>
          </form>
        </aside>
      )}
    </main>
  );
}

export function Room({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const { name, setName } = useDisplayName();

  if (!name) return <NamePrompt onSubmit={setName} />;
  return <CallRoom roomId={roomId} onLeave={onLeave} displayName={name} />;
}
