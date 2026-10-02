/**
 * Horizontal furniture of the chat column.
 *
 * The minimap rail's slot and the padding inside the message column and the composer are one
 * layout: the message column scrolls beside the rail, while the composer and the other
 * column-aligned wrappers span the whole chat content area and reserve the rail as right padding.
 * Deriving all of them from one module is what keeps those boxes' edges aligned — a second copy of
 * "36" is what silently shifted the composer 12px left of the messages when the rail was narrowed.
 */
export const CHAT_MINIMAP_WIDTH = 24;
export const CHAT_COLUMN_PADDING = 16;

/**
 * Right inset that lines a full-width wrapper up with the message column and the composer. A
 * touch layout has no rail, so it only carries the column padding.
 */
export function chatColumnRightInset(isMobile: boolean): number {
  return isMobile ? CHAT_COLUMN_PADDING : CHAT_COLUMN_PADDING + CHAT_MINIMAP_WIDTH;
}
