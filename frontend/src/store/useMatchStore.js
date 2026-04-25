import { create } from "zustand";

export const useMatchStore = create((set) => ({
  liveMatches: [],
  selectedMatch: null,
  replayState: {
    minute: 0,
    isPlaying: false,
    speed: 1,
  },
  setLiveMatches: (liveMatches) => set({ liveMatches }),
  setSelectedMatch: (selectedMatch) => set({ selectedMatch }),
  updateReplayState: (updates) =>
    set((state) => ({
      replayState: {
        ...state.replayState,
        ...updates,
      },
    })),
}));
