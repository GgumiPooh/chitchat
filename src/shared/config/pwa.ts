export const APPLE_SPLASH_DIR = "/icons/splash";

type AppleSplashDevice = {
  /** Portrait CSS width, as iOS reports it to `device-width` in both orientations. */
  width: number;
  /** Portrait CSS height, as iOS reports it to `device-height` in both orientations. */
  height: number;
  ratio: number;
  devices: string;
};

export type AppleSplashLink = {
  fileName: string;
  media: string;
  /** Device pixels — the image has to match the launch surface exactly or iOS drops it. */
  pixelWidth: number;
  pixelHeight: number;
};

// INFO: `device-width`/`device-height` do not swap with orientation on iOS, so each device is one row and only `orientation` distinguishes the two images.
const APPLE_SPLASH_DEVICES: AppleSplashDevice[] = [
  { width: 440, height: 956, ratio: 3, devices: "iPhone 16 Pro Max" },
  { width: 430, height: 932, ratio: 3, devices: "iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max" },
  { width: 428, height: 926, ratio: 3, devices: "iPhone 14 Plus, 13 Pro Max, 12 Pro Max" },
  { width: 414, height: 896, ratio: 3, devices: "iPhone 11 Pro Max, XS Max" },
  { width: 414, height: 896, ratio: 2, devices: "iPhone 11, XR" },
  { width: 414, height: 736, ratio: 3, devices: "iPhone 8 Plus" },
  { width: 402, height: 874, ratio: 3, devices: "iPhone 16 Pro" },
  { width: 393, height: 852, ratio: 3, devices: "iPhone 16, 15 Pro, 15, 14 Pro" },
  { width: 390, height: 844, ratio: 3, devices: "iPhone 14, 13, 13 Pro, 12, 12 Pro" },
  { width: 375, height: 812, ratio: 3, devices: "iPhone 13 mini, 12 mini, 11 Pro, XS, X" },
  { width: 375, height: 667, ratio: 2, devices: "iPhone SE 3, SE 2, 8, 7" },
];

const ORIENTATIONS = ["portrait", "landscape"] as const;

// INFO: A device with no matching row is not broken — iOS falls back to the manifest `background_color`, which is the same `canvas` the images are painted on.
export const APPLE_SPLASH_LINKS: AppleSplashLink[] = APPLE_SPLASH_DEVICES.flatMap(
  ({ width, height, ratio }) =>
    ORIENTATIONS.map((orientation) => {
      const isPortrait = orientation === "portrait";
      const pixelWidth = (isPortrait ? width : height) * ratio;
      const pixelHeight = (isPortrait ? height : width) * ratio;

      return {
        fileName: `splash-${pixelWidth}x${pixelHeight}.png`,
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
        pixelWidth,
        pixelHeight,
      };
    }),
);
