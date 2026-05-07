import { useCallback, useEffect, useState } from "react";
import type { Member, RemoteAudioState } from "./types";

export function useRemoteAudios(params: {
  members: Member[];
  onRemoteCountChange?: (count: number) => void;
}) {
  const { members, onRemoteCountChange } = params;

  const [remoteAudios, setRemoteAudios] = useState<
    Record<string, RemoteAudioState>
  >({});

  const upsertRemoteAudio = useCallback(
    (remoteId: string, stream: MediaStream) => {
      setRemoteAudios((prev) => {
        const prevState = prev[remoteId];
        const member = members.find((m) => m.device_id === remoteId);

        if (prevState?.stream === stream) {
          return {
            ...prev,
            [remoteId]: {
              ...prevState,
              member,
            },
          };
        }

        return {
          ...prev,
          [remoteId]: {
            stream,
            member,
          },
        };
      });
    },
    [members]
  );

  const removeRemoteAudio = useCallback((remoteId: string) => {
    setRemoteAudios((prev) => {
      const next = { ...prev };
      delete next[remoteId];
      return next;
    });
  }, []);

  useEffect(() => {
    setRemoteAudios((prev) => {
      const next: Record<string, RemoteAudioState> = {};

      for (const [remoteId, state] of Object.entries(prev)) {
        const member = members.find((m) => m.device_id === remoteId);
        next[remoteId] = { ...state, member };
      }

      return next;
    });
  }, [members]);

  useEffect(() => {
    onRemoteCountChange?.(Object.keys(remoteAudios).length);
  }, [remoteAudios, onRemoteCountChange]);

  return {
    remoteAudios,
    upsertRemoteAudio,
    removeRemoteAudio,
  };
}