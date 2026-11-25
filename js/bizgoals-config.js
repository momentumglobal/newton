// js/bizgoals-config.js — Goals & Actions (business goals) configuration (N-532 / BG-1)
// Extends CONFIG (config.js); loaded by command-centre.html only, straight after api-headcount.js, before
// bizgoals-data.js. Declarations only — nothing here is read at load time. Readers: bizgoals-data.js,
// api-bizgoals.js (N-532), bizgoals-track.js / bizgoals-track-ui.js (N-533, the Command Centre page) and the tile and
// Newton for Claude tool (N-534, N-535).
// BG-D9: the PDP tracker is copied, not shared; nothing in the pdp-* files reads CONFIG.BIZGOALS.
//   LISTS          the three lists (BG-D2). Admin + Leadership only in SharePoint; never in CACHE.persistentLists,
//                  DELTA, MCP.allowedLists or a Command Bar source.
//   GOAL_LEVELS    BG-D3 nesting, the same values as CONFIG.PDP.GOAL_LEVELS.
//   GOAL_STATUS    goal status. N-533 (BG-D14) appended CARRIED, set only by the rollover (rolloverBusinessGoals).
//   CARRIED        the closing status of a goal carried into the next year, and of its open sub-goals (BG-D15).
//   PICKABLE_STATUS what the tracker's Status select offers: GOAL_STATUS without CARRIED.
//   TRACKER        HALF_START_MONTH = first month of the second half (Quarterly goals from that quarter nest under
//                  H2); DUE_SOON_DAYS = an open action due within this many days shows "Due soon".
//   RAG            worst first (the roll-up in N-533 takes the lowest index).
//   OWNER_EXCLUDE  shared accounts that are Admin rows but never goal owners (BG-D8).
//   LIMITS         TITLE_MAX / TEXT_MAX / UPDATE_MAX / OWNER_NAME_MAX = characters; YEAR_MIN / YEAR_MAX = goal year range.
// Enum values live here, never in SharePoint Choice columns (a Choice column drifts).
CONFIG.BIZGOALS = {
  LISTS: { GOALS: 'BusinessGoals', ACTIONS: 'BusinessActions', UPDATES: 'BusinessGoalUpdates' },
  GOAL_LEVELS:   ['Annual', 'H2', 'Quarterly'],
  GOAL_STATUS:   ['Open', 'Achieved', 'Dropped', 'Carried forward'],
  CARRIED:       'Carried forward',
  PICKABLE_STATUS: ['Open', 'Achieved', 'Dropped'],
  RAG:           ['Red', 'Amber', 'Green'],
  OWNER_EXCLUDE: ['admin@momentumglobal.co', 'admin@talentpoint.onmicrosoft.com'],
  TRACKER: { HALF_START_MONTH: 7, DUE_SOON_DAYS: 14 },
  LIMITS: { TITLE_MAX: 150, TEXT_MAX: 2000, UPDATE_MAX: 2000, OWNER_NAME_MAX: 120, YEAR_MIN: 2020, YEAR_MAX: 2100 },
};
