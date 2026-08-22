export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit };

export type ClientMessage =
  | { type: "join"; room: string }
  | { type: "signal"; to: string; data: SignalData };

export type ServerMessage =
  | { type: "joined"; selfId: string; peerId: string | null }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "room-full" }
  | { type: "error"; message: string };
