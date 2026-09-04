// --- PART 2 RESPONSIVE LAYOUT CONSTANTS ---
// Keep mobile fixed-surface offsets in one place so Header, Sidebar, list spacing,
// and auto-follow do not drift apart when UI dimensions change.
export const MOBILE_TABLE_TOP_OFFSET = 112;
export const MOBILE_TEXT_TOP_OFFSET = 68;
export const MOBILE_AUX_TOP_OFFSET = 68;
export const MOBILE_BOTTOM_PLAYER_RESERVE = 84;
export const MOBILE_BOTTOM_PLAYER_RESERVE_CSS = `calc(${MOBILE_BOTTOM_PLAYER_RESERVE}px + env(safe-area-inset-bottom, 0px))`;

export const getMobilePlayerTopOffset = (mode) => (
  mode === 'table' ? MOBILE_TABLE_TOP_OFFSET : MOBILE_TEXT_TOP_OFFSET
);

export const getMobileSidebarTopOffset = ({ mode, mobileTab }) => (
  mode === 'table' && mobileTab === 'player'
    ? MOBILE_TABLE_TOP_OFFSET
    : MOBILE_AUX_TOP_OFFSET
);
