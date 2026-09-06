import { HANGING_CITY_CEILING_Y } from './hanging-city-topology.js';

export const CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS = HANGING_CITY_CEILING_Y + 32;

export function cylindricalFarPlaneDistance(horizontalDrawDistance, verticalAllowance = CYLINDRICAL_VERTICAL_SECTION_ALLOWANCE_METERS) {
  const horizontal = Math.max(1, Number(horizontalDrawDistance) || 1);
  const vertical = Math.max(0, Number(verticalAllowance) || 0);
  return Math.hypot(horizontal, vertical);
}
