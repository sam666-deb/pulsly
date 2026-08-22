import { useEffect, useRef, useState } from "react";
import { useCall } from "./useCall";
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
  const { status, localStream, remoteStream, micOn, cameraOn, toggleMic, toggleCamera, leave } =
    useCall(roomId);
  const [copied, setCopied] = useState(false);

  const shareLink = `${window.location.origin}/room/${roomId}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const hangUp = () => {
    leave();
    onLeave();
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
          <VideoTile stream={localStream} muted label="You" />
          {remoteStream && <VideoTile stream={remoteStream} muted={false} label="Them" />}
        </div>

        {STATUS_TEXT[status] && (
          <div className="status-banner">
            <p>{STATUS_TEXT[status]}</p>
          </div>
        )}

        <div className="controls">
          <button className={micOn ? "control" : "control off"} onClick={toggleMic} disabled={!localStream}>
            {micOn ? "Mute" : "Unmute"}
          </button>
          <button
            className={cameraOn ? "control" : "control off"}
            onClick={toggleCamera}
            disabled={!localStream}
          >
            {cameraOn ? "Camera off" : "Camera on"}
          </button>
          <button className="control hang-up" onClick={hangUp}>
            Leave
          </button>
        </div>
      </div>
    </main>
  );
}
