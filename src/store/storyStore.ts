import { create } from "zustand";

/**
 * The slow part of the scroll story: values that change a few times per page, not every frame, so it is safe
 * for them to drive React. Per-frame values live in `lib/story/sceneState` instead.
 */
interface StoryState {
  /** Id of the chapter whose top most recently passed the middle of the screen, or null off the landing page. */
  activeChapter: string | null;
  /** The tour stop in view while a tour chapter is pinned, rounded to a whole stop. */
  tourIndex: number;
  setActiveChapter: (id: string | null) => void;
  setTourIndex: (index: number) => void;
}

export const useStoryStore = create<StoryState>((set) => ({
  activeChapter: null,
  tourIndex: 0,
  setActiveChapter: (id) => set({ activeChapter: id }),
  setTourIndex: (index) => set({ tourIndex: index }),
}));
