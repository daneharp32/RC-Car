// Shared smooth jump profile used by both the rendered ramp and Cannon physics.
export const JUMP_GRID_SPACING = 0.1;

export function createJumpProfile(width, length, height, spacing = JUMP_GRID_SPACING) {
  const safeSpacing = Math.max(0.05, Number(spacing) || JUMP_GRID_SPACING);
  const widthSegments = Math.max(4, Math.ceil(width / safeSpacing - 1e-8));
  const lengthSegments = Math.max(4, Math.ceil(length / safeSpacing - 1e-8));
  const actualWidth = widthSegments * safeSpacing;
  const actualLength = lengthSegments * safeSpacing;

  // A cosine-squared bell gives the jump a rounded crown and a zero-slope
  // transition at every edge, so it can be approached from either direction.
  const heights = Array.from({ length: widthSegments + 1 }, (_, xIndex) => {
    const normalizedX = (xIndex / widthSegments) * 2 - 1;
    const across = Math.cos(Math.abs(normalizedX) * Math.PI * 0.5) ** 2;

    return Array.from({ length: lengthSegments + 1 }, (_, lengthIndex) => {
      const normalizedLength = (lengthIndex / lengthSegments) * 2 - 1;
      const along = Math.cos(Math.abs(normalizedLength) * Math.PI * 0.5) ** 2;
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
