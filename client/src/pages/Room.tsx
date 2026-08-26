import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useCall } from "../hooks/useCall";
import { useTheme } from "../hooks/useTheme";
import { useDisplayName } from "../hooks/useDisplayName";
import {
  MicIcon,
  CameraIcon,
  ScreenShareIcon,
  ChatIcon,
  LeaveIcon,
  SmileIcon,
  SunIcon,
  MoonIcon,
} from "../components/icons";
import { Brand } from "../components/Logo";
import "./Room.css";

const REACTION_EMOJI = ["👍", "❤️", "😂", "🎉", "👏"];

function VideoTile({
  stream,
  muted,
  label,
}: {
  stream: MediaStream | null;
  muted: boolean;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={ref} autoPlay playsInline muted={muted} />
      <span className="video-label">{label}</span>
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
    quality,
    connectedAt,
    leave,
  } = useCall(roomId, displayName);
  const { theme, toggleTheme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState(Date.now());
  const seenCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const shareLink = `${window.location.origin}/room/${roomId}`;
  const unread = chatOpen ? 0 : messages.length - seenCountRef.current;
  const elapsed = connectedAt ? formatElapsed(now - connectedAt) : null;
  const tileCount = peers.length + 1;
  const videoGridColumns = Math.max(1, Math.ceil(Math.sqrt(tileCount)));

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

  return (
    <main className="room">
      <header className="room-bar">
        <Brand size={22} />
        <div className="room-bar-right">
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
        <div className="video-grid" style={{ "--video-cols": videoGridColumns } as CSSProperties}>
          <VideoTile stream={screenStream ?? localStream} muted label={displayName} />
          {peers.map((peer) => (
            <VideoTile key={peer.id} stream={peer.stream} muted={false} label={peer.name ?? "Guest"} />
          ))}

          <div className="reaction-layer" aria-hidden="true">
            {reactions.map((r) => (
              <span key={r.id} className={r.self ? "floating-reaction self" : "floating-reaction"}>
                {r.emoji}
              </span>
            ))}
          </div>
        </div>

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
