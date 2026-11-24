// js/bizgoals-config.js — Goals & Actions (business goals) configuration (N-532 / BG-1)
// Extends CONFIG (config.js); loaded by command-centre.html only, straight after api-headcount.js, before
// bizgoals-data.js. Declarations only — nothing here is read at load time. Readers: bizgoals-data.js,
// api-bizgoals.js (N-532) and the Command Centre page, tile and Newton for Claude tool (N-533 to N-535).
// BG-D9: the PDP tracker is copied, not shared; nothing in the pdp-* files reads CONFIG.BIZGOALS.
//   LISTS          the three lists (BG-D2). Admin + Leadership only in SharePoint; never in CACHE.persistentLists,
//                  DELTA, MCP.allowedLists or a Command Bar source.
//   GOAL_LEVELS    BG-D3 nesting, the same values as CONFIG.PDP.GOAL_LEVELS.
//   GOAL_STATUS    goal status; N-533 may append a closing status for rollover.
//   RAG            worst first (the roll-up in N-533 takes the lowest index).
//   OWNER_EXCLUDE  shared accounts that are Admin rows but never goal owners (BG-D8).
//   LIMITS         TITLE_MAX / TEXT_MAX / UPDATE_MAX / OWNER_NAME_MAX = characters; YEAR_MIN / YEAR_MAX = goal year range.
// Enum values live here, never in SharePoint Choice columns (a Choice column drifts).
CONFIG.BIZGOALS = {
  LISTS: { GOALS: 'BusinessGoals', ACTIONS: 'BusinessActions', UPDATES: 'BusinessGoalUpdates' },
  GOAL_LEVELS:   ['Annual', 'H2', 'Quarterly'],
  GOAL_STATUS:   ['Open', 'Achieved', 'Dropped'],
  RAG:           ['Red', 'Amber', 'Green'],
  OWNER_EXCLUDE: ['admin@momentumglobal.co', 'admin@talentpoint.onmicrosoft.com'],
  LIMITS: { TITLE_MAX: 150, TEXT_MAX: 2000, UPDATE_MAX: 2000, OWNER_NAME_MAX: 120, YEAR_MIN: 2020, YEAR_MAX: 2100 },
};
