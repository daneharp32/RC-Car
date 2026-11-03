// Shared two-way ridge profile used by the rendered jump and Cannon heightfield.
export const JUMP_GRID_SPACING = 0.1;

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function createJumpProfile(width, length, height, spacing = JUMP_GRID_SPACING) {
  const safeSpacing = Math.max(0.05, Number(spacing) || JUMP_GRID_SPACING);
  const widthSegments = Math.max(4, Math.ceil(width / safeSpacing - 1e-8));
  const lengthSegments = Math.max(4, Math.ceil(length / safeSpacing - 1e-8));
  const actualWidth = widthSegments * safeSpacing;
  const actualLength = lengthSegments * safeSpacing;

  // The jump is a transverse ridge: its crest stays broad across the lane,
  // while the approach and departure slopes run only along the driving line.
  const crestHalfLength = 0.2;
  const sideShoulderStart = 0.88;

  const heights = Array.from({ length: widthSegments + 1 }, (_, xIndex) => {
    const normalizedAcross = Math.abs((xIndex / widthSegments) * 2 - 1);
    const shoulderProgress = (normalizedAcross - sideShoulderStart) / (1 - sideShoulderStart);
    const across = normalizedAcross <= sideShoulderStart
      ? 1
      : 1 - smoothStep(shoulderProgress);

    return Array.from({ length: lengthSegments + 1 }, (_, lengthIndex) => {
      // Symmetry makes both ends of the ridge usable as takeoff faces.
      const normalizedAlong = Math.abs((lengthIndex / lengthSegments) * 2 - 1);
      const rampProgress = (normalizedAlong - crestHalfLength) / (1 - crestHalfLength);
      const along = normalizedAlong <= crestHalfLength
        ? 1
        : 1 - smoothStep(rampProgress);
      const value = Math.max(0, height * across * along);
      return value < 1e-6 ? 0 : value;
    });
  });

  return {
    width: actualWidth,
    length: actualLength,
    height,
    elementSize: safeSpacing,
    heights
  };
}
