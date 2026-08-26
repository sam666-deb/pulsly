import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, SignalData } from "../lib/signaling-types";
import { fetchIceServers } from "../lib/ice-servers";

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ?? "ws://localhost:8080";

export type CallStatus =
  | "requesting-media"
  | "connecting"
  | "waiting-for-peer"
  | "negotiating"
  | "connected"
  | "room-full"
  | "media-denied"
  | "error";

export interface ChatMessage {
  text: string;
  from: string | null;
  self: boolean;
  ts: number;
}

export interface Reaction {
  id: number;
  emoji: string;
  self: boolean;
}

export type ConnectionQuality = "good" | "fair" | "poor";

export interface RemotePeer {
  id: string;
  name: string | null;
  stream: MediaStream;
  quality: ConnectionQuality | null;
}

type DataChannelMessage =
  | { kind: "chat"; text: string }
  | { kind: "reaction"; emoji: string }
  | { kind: "name"; name: string };

export function useCall(room: string, displayName: string) {
  const [status, setStatus] = useState<CallStatus>("requesting-media");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [quality, setQuality] = useState<ConnectionQuality | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const reactionIdRef = useRef(0);
  const displayNameRef = useRef(displayName);

  // Authoritative per-peer state lives in refs (keyed by peer id) so mesh
  // connections can be managed imperatively; `peers` (state) is a snapshot
  // array derived from these for rendering.
  const peersRef = useRef<Map<string, RemotePeer>>(new Map());
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const statsIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  const syncPeers = useCallback(() => {
    setPeers(Array.from(peersRef.current.values()));
  }, []);

  const send = useCallback((message: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const recomputeStatus = useCallback(() => {
    if (peersRef.current.size === 0) {
      setStatus("waiting-for-peer");
      return;
    }
    const anyConnected = Array.from(pcsRef.current.values()).some(
      (pc) => pc.connectionState === "connected",
    );
    setStatus(anyConnected ? "connected" : "negotiating");
  }, []);

  const recomputeQuality = useCallback(() => {
    const qualities = Array.from(peersRef.current.values())
      .map((p) => p.quality)
      .filter((q): q is ConnectionQuality => q !== null);
    if (qualities.length === 0) setQuality(null);
    else if (qualities.includes("poor")) setQuality("poor");
    else if (qualities.includes("fair")) setQuality("fair");
    else setQuality("good");
  }, []);

  const stopQualityPollingFor = useCallback((peerId: string) => {
    const interval = statsIntervalsRef.current.get(peerId);
    if (interval) clearInterval(interval);
    statsIntervalsRef.current.delete(peerId);
  }, []);

  const removePeer = useCallback(
    (peerId: string) => {
      pcsRef.current.get(peerId)?.close();
      pcsRef.current.delete(peerId);
      dataChannelsRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      stopQualityPollingFor(peerId);
      peersRef.current.delete(peerId);
      syncPeers();
      recomputeQuality();
      recomputeStatus();
      if (peersRef.current.size === 0) setConnectedAt(null);
    },
    [stopQualityPollingFor, syncPeers, recomputeQuality, recomputeStatus],
  );

  const teardown = useCallback(() => {
    for (const peerId of Array.from(statsIntervalsRef.current.keys())) {
      stopQualityPollingFor(peerId);
    }
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    dataChannelsRef.current.clear();
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    pendingCandidatesRef.current.clear();
    peersRef.current.clear();
    wsRef.current?.close();
    wsRef.current = null;
  }, [stopQualityPollingFor]);

  const addReaction = useCallback((emoji: string, self: boolean) => {
    const id = ++reactionIdRef.current;
    setReactions((prev) => [...prev, { id, emoji, self }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2500);
  }, []);

  const setupDataChannelFor = useCallback(
    (peerId: string, channel: RTCDataChannel) => {
      dataChannelsRef.current.set(peerId, channel);

      const announceName = () => {
        channel.send(JSON.stringify({ kind: "name", name: displayNameRef.current }));
      };
      if (channel.readyState === "open") announceName();
      else channel.onopen = announceName;

      channel.onmessage = (event) => {
        let msg: DataChannelMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.kind === "chat") {
          const from = peersRef.current.get(peerId)?.name ?? null;
          setMessages((prev) => [...prev, { text: msg.text, from, self: false, ts: Date.now() }]);
        } else if (msg.kind === "reaction") {
          addReaction(msg.emoji, false);
        } else if (msg.kind === "name") {
          const peer = peersRef.current.get(peerId);
          if (peer) {
            peer.name = msg.name;
            syncPeers();
          }
        }
      };
    },
    [addReaction, syncPeers],
  );

  const startQualityPollingFor = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      stopQualityPollingFor(peerId);
      const interval = setInterval(async () => {
        let rtt = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
            rtt = report.currentRoundTripTime ?? 0;
          }
          if (report.type === "inbound-rtp" && report.kind === "video") {
            packetsLost = report.packetsLost ?? 0;
            packetsReceived = report.packetsReceived ?? 0;
          }
        });
        const total = packetsLost + packetsReceived;
        const lossRatio = total > 0 ? packetsLost / total : 0;
        let next: ConnectionQuality;
        if (rtt < 0.15 && lossRatio < 0.02) next = "good";
        else if (rtt < 0.3 && lossRatio < 0.05) next = "fair";
        else next = "poor";
        const peer = peersRef.current.get(peerId);
        if (peer) {
          peer.quality = next;
          syncPeers();
        }
        recomputeQuality();
      }, 3000);
      statsIntervalsRef.current.set(peerId, interval);
    },
    [stopQualityPollingFor, syncPeers, recomputeQuality],
  );

  const createPeerConnectionFor = useCallback(
    (stream: MediaStream, peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      pcsRef.current.set(peerId, pc);
      pendingCandidatesRef.current.set(peerId, []);

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      pc.ondatachannel = (event) => setupDataChannelFor(peerId, event.channel);

      pc.ontrack = (event) => {
        const peer = peersRef.current.get(peerId);
        if (!peer) return;
        peer.stream.addTrack(event.track);
        syncPeers();
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
        if (pc.connectionState === "connected") {
          setConnectedAt((prev) => prev ?? Date.now());
          startQualityPollingFor(peerId, pc);
          recomputeStatus();
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          removePeer(peerId);
        }
      };

      return pc;
    },
    [send, setupDataChannelFor, syncPeers, startQualityPollingFor, recomputeStatus, removePeer],
  );

  const addPeer = useCallback(
    (peerId: string) => {
      peersRef.current.set(peerId, { id: peerId, name: null, stream: new MediaStream(), quality: null });
      syncPeers();
    },
    [syncPeers],
  );

  const handleSignal = useCallback(
    async (from: string, data: SignalData) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      const pending = pendingCandidatesRef.current.get(from) ?? [];

      if (data.kind === "offer") {
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        for (const candidate of pending) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current.set(from, []);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "signal", to: from, data: { kind: "answer", sdp: answer.sdp! } });
      } else if (data.kind === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        for (const candidate of pending) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current.set(from, []);
      } else if (data.kind === "ice-candidate") {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(data.candidate);
        } else {
          pending.push(data.candidate);
          pendingCandidatesRef.current.set(from, pending);
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
        navigator.mediaDevices
          .getUserMedia({
            video: true,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          })
          .then(
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
      localStreamRef.current = stream;
      setLocalStream(stream);
      setStatus("connecting");

      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => send({ type: "join", room });

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);

        if (msg.type === "joined") {
          selfIdRef.current = msg.selfId;
          // Existing peers will initiate offers to us — just wait.
          for (const peerId of msg.peerIds) {
            addPeer(peerId);
            createPeerConnectionFor(stream!, peerId);
          }
          setStatus(msg.peerIds.length === 0 ? "waiting-for-peer" : "negotiating");
        } else if (msg.type === "peer-joined") {
          // We were already here — we initiate the offer, and own the data channel.
          addPeer(msg.peerId);
          const pc = createPeerConnectionFor(stream!, msg.peerId);
          setupDataChannelFor(msg.peerId, pc.createDataChannel("chat"));
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer).then(() => offer))
            .then((offer) => {
              send({
                type: "signal",
                to: msg.peerId,
                data: { kind: "offer", sdp: offer.sdp! },
              });
            });
          recomputeStatus();
        } else if (msg.type === "signal") {
          handleSignal(msg.from, msg.data);
        } else if (msg.type === "peer-left") {
          removePeer(msg.peerId);
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

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    const camTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    if (!camTrack) return;
    for (const pc of pcsRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      sender?.replaceTrack(camTrack);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (pcsRef.current.size === 0) return;

    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return;
    }
    const screenTrack = display.getVideoTracks()[0];
    screenStreamRef.current = display;
    setScreenStream(display);
    screenTrack.onended = stopScreenShare;

    for (const pc of pcsRef.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(screenTrack);
    }
  }, [stopScreenShare]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    let sentToAny = false;
    for (const channel of dataChannelsRef.current.values()) {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify({ kind: "chat", text: trimmed }));
        sentToAny = true;
      }
    }
    if (sentToAny) {
      setMessages((prev) => [...prev, { text: trimmed, from: displayNameRef.current, self: true, ts: Date.now() }]);
    }
  }, []);

  const sendReaction = useCallback(
    (emoji: string) => {
      let sentToAny = false;
      for (const channel of dataChannelsRef.current.values()) {
        if (channel.readyState === "open") {
          channel.send(JSON.stringify({ kind: "reaction", emoji }));
          sentToAny = true;
        }
      }
      if (sentToAny) addReaction(emoji, true);
    },
    [addReaction],
  );

  const leave = useCallback(() => {
    localStream?.getTracks().forEach((t) => t.stop());
    teardown();
  }, [localStream, teardown]);

  return {
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
  };
}
