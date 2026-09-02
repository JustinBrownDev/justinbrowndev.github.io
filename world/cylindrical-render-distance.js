export const CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS = 96;

export function cylindricalFarPlaneDistance(horizontalDrawDistance, verticalAllowance = CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS) {
  const horizontal = Math.max(1, Number(horizontalDrawDistance) || 1);
  const vertical = Math.max(0, Number(verticalAllowance) || 0);
  return Math.hypot(horizontal, vertical);
}
