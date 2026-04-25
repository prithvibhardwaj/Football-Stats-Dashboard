import { create } from "zustand";

export const useCompareStore = create((set) => ({
  leftPlayer: null,
  rightPlayer: null,
  setComparedPlayer: (slot, player) =>
    set((state) => ({
      ...state,
      [slot]: player,
    })),
  clearComparison: () =>
    set({
      leftPlayer: null,
      rightPlayer: null,
    }),
}));
