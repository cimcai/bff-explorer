import { describe, expect, it } from "vitest";
import {
  MOVIE_CAPTURE_FPS,
  MOVIE_CAPTURE_HEIGHT,
  MOVIE_CAPTURE_WIDTH,
  MOVIE_POST_ROLL_MS,
  MOVIE_PRE_ROLL_MS,
  MOVIE_VIDEO_BITS_PER_SECOND,
  mediaRecorderOptions,
  preferredVideoMimeType,
  videoExtension
} from "../src/ui/movieCapture/mediaSettings";

describe("movie capture media settings", () => {
  it("uses a shareable landscape preset with one minute of post-roll", () => {
    expect(MOVIE_CAPTURE_WIDTH).toBe(1440);
    expect(MOVIE_CAPTURE_HEIGHT).toBe(810);
    expect(MOVIE_CAPTURE_FPS).toBe(24);
    expect(MOVIE_PRE_ROLL_MS).toBe(10_000);
    expect(MOVIE_POST_ROLL_MS).toBe(60_000);
    expect(MOVIE_VIDEO_BITS_PER_SECOND).toBeLessThanOrEqual(3_000_000);
  });

  it("prefers repairable webm even when mp4 is available", () => {
    const mimeType = preferredVideoMimeType((candidate) =>
      candidate.startsWith("video/mp4") || candidate === "video/webm;codecs=vp9"
    );

    expect(mimeType).toBe("video/webm;codecs=vp9");
    expect(videoExtension(mimeType)).toBe("webm");
  });

  it("falls back through webm codecs", () => {
    const mimeType = preferredVideoMimeType((candidate) =>
      candidate === "video/webm;codecs=vp8"
    );

    expect(mimeType).toBe("video/webm;codecs=vp8");
    expect(videoExtension(mimeType)).toBe("webm");
  });

  it("does not use mp4 for rolling pre-roll capture", () => {
    expect(preferredVideoMimeType((candidate) => candidate.startsWith("video/mp4")))
      .toBe("");
  });

  it("passes bitrate and keyframe hints to MediaRecorder", () => {
    expect(mediaRecorderOptions("video/webm")).toMatchObject({
      mimeType: "video/webm",
      videoBitsPerSecond: MOVIE_VIDEO_BITS_PER_SECOND,
      videoKeyFrameIntervalDuration: 1_000
    });
  });
});
