import Color from "@arcgis/core/Color";

export const SymbologyColors = {
  selection(alpha = 1) {
    return new Color([99, 177, 255, alpha])
  },
  measurements(alpha = 1) {
    return new Color([255, 0, 0, alpha])
  }
} as const;