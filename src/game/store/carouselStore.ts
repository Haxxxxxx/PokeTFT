import { create } from "zustand";

/** Carousel round state: the free unit choices currently on offer. */
type CarouselState = {
  options: string[] | null;
  open: (options: string[]) => void;
  clear: () => void;
};

export const useCarousel = create<CarouselState>((set) => ({
  options: null,
  open: (options) => set({ options }),
  clear: () => set({ options: null }),
}));
