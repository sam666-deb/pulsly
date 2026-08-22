import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCall } from "./useCall";
import { MicIcon, CameraIcon, ScreenShareIcon, ChatIcon, LeaveIcon } from "./icons";
import "./Room.css";

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

const STATUS_TEXT: Record<string, string> = {
  "requesting-media": "Asking for camera and microphone access…",
  connecting: "Connecting…",
  "waiting-for-peer": "Waiting for someone to join — share the link above.",
  negotiating: "Connecting to the other person…",
  "peer-left": "The other person left the call.",
  "room-full": "This room already has two people in it.",
  "media-denied": "Camera or microphone access was denied.",
  error: "Something went wrong with the connection.",
};

export function Room({ roomId, onLeave }: { roomId: string; onLeave: () => void }) {
  const {
    status,
    localStream,
    remoteStream,
    micOn,
    cameraOn,
    toggleMic,
    toggleCamera,
    screenStream,
    toggleScreenShare,
    messages,
    sendMessage,
    leave,
  } = useCall(roomId);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const seenCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const shareLink = `${window.location.origin}/room/${roomId}`;
  const unread = chatOpen ? 0 : messages.length - seenCountRef.current;

  useEffect(() => {
    if (chatOpen) seenCountRef.current = messages.length;
  }, [chatOpen, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        <span className="brand">Pulsly</span>
        <button className="room-code" onClick={copyLink}>
          <code>{roomId}</code>
          <span>{copied ? "Copied" : "Copy link"}</span>
        </button>
      </header>

      <div className="room-main">
        <div className="video-grid">
          <VideoTile stream={screenStream ?? localStream} muted label="You" />
          {remoteStream && <VideoTile stream={remoteStream} muted={false} label="Them" />}
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
            title={micOn ? "Mute" : "Unmute"}
            aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          >
            <MicIcon crossedOut={!micOn} />
          </button>
          <button
            className={cameraOn ? "control" : "control off"}
            onClick={toggleCamera}
            disabled={!localStream}
            title={cameraOn ? "Turn camera off" : "Turn camera on"}
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
