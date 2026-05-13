export const MOVIE_CAPTURE_WIDTH = 1440;
export const MOVIE_CAPTURE_HEIGHT = 810;
export const MOVIE_CAPTURE_FPS = 24;
export const MOVIE_PRE_ROLL_MS = 10_000;
export const MOVIE_POST_ROLL_MS = 60_000;
export const MOVIE_TIMESLICE_MS = 1_000;
export const MOVIE_VIDEO_BITS_PER_SECOND = 2_800_000;

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

export function preferredVideoMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string {
  return MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType)) ?? "";
}

export function videoExtension(mimeType: string): "mp4" | "webm" {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export function mediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  const options: MediaRecorderOptions & {
    videoKeyFrameIntervalDuration?: number;
  } = {
    videoBitsPerSecond: MOVIE_VIDEO_BITS_PER_SECOND
  };
  if (mimeType) {
    options.mimeType = mimeType;
  }
  options.videoKeyFrameIntervalDuration = MOVIE_TIMESLICE_MS;
  return options;
}
