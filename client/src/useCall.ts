import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, SignalData } from "./signaling-types";
import { fetchIceServers } from "./ice-servers";

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8080";

export type CallStatus =
  | "requesting-media"
  | "connecting"
  | "waiting-for-peer"
  | "negotiating"
  | "connected"
  | "peer-left"
  | "room-full"
  | "media-denied"
  | "error";

export function useCall(room: string) {
  const [status, setStatus] = useState<CallStatus>("requesting-media");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const iceServersRef = useRef<RTCIceServer[]>([]);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const teardown = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const createPeerConnection = useCallback(
    (stream: MediaStream, peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcRef.current = pc;

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      pc.ontrack = (event) => {
        remoteStreamRef.current.addTrack(event.track);
        setRemoteStream(remoteStreamRef.current);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({
            type: "signal",
            to: peerId,
            data: { kind: "ice-candidate", candidate: event.candidate.toJSON() },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setStatus("connected");
        if (pc.connectionState === "failed") setStatus("error");
      };

      return pc;
    },
    [send],
  );

  const handleSignal = useCallback(
    async (from: string, data: SignalData) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (data.kind === "offer") {
        setStatus("negotiating");
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "signal", to: from, data: { kind: "answer", sdp: answer.sdp! } });
      } else if (data.kind === "answer") {
        setStatus("negotiating");
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
      } else if (data.kind === "ice-candidate") {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(data.candidate);
        } else {
          pendingCandidatesRef.current.push(data.candidate);
        }
      }
    },
    [send],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      const [mediaResult, iceServers] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(
          (s) => ({ ok: true as const, stream: s }),
          () => ({ ok: false as const, stream: null }),
        ),
        fetchIceServers(),
      ]);
      iceServersRef.current = iceServers;

      if (!mediaResult.ok || !mediaResult.stream) {
        if (!cancelled) setStatus("media-denied");
        return;
      }
      stream = mediaResult.stream;
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setLocalStream(stream);
      setStatus("connecting");

      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => send({ type: "join", room });

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);

        if (msg.type === "joined") {
          selfIdRef.current = msg.selfId;
          if (msg.peerId) {
            // Someone was already here — wait for their offer, don't initiate.
            peerIdRef.current = msg.peerId;
            setStatus("negotiating");
            createPeerConnection(stream!, msg.peerId);
          } else {
            setStatus("waiting-for-peer");
          }
        } else if (msg.type === "peer-joined") {
          // We were already here — we initiate the offer.
          peerIdRef.current = msg.peerId;
          setStatus("negotiating");
          const pc = createPeerConnection(stream!, msg.peerId);
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer).then(() => offer))
            .then((offer) => {
              send({
                type: "signal",
                to: msg.peerId,
                data: { kind: "offer", sdp: offer.sdp! },
              });
            });
        } else if (msg.type === "signal") {
          handleSignal(msg.from, msg.data);
        } else if (msg.type === "peer-left") {
          setStatus("peer-left");
          pcRef.current?.close();
          pcRef.current = null;
          remoteStreamRef.current = new MediaStream();
          setRemoteStream(null);
          peerIdRef.current = null;
        } else if (msg.type === "room-full") {
          setStatus("room-full");
        } else if (msg.type === "error") {
          setStatus("error");
        }
      };

      ws.onerror = () => setStatus("error");
    }

    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const toggleMic = useCallback(() => {
    if (!localStream) return;
    const next = !micOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [localStream, micOn]);

  const toggleCamera = useCallback(() => {
    if (!localStream) return;
    const next = !cameraOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCameraOn(next);
  }, [localStream, cameraOn]);

  const leave = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    teardown();
  }, [localStream, teardown]);

  return { status, localStream, remoteStream, micOn, cameraOn, toggleMic, toggleCamera, leave };
}
