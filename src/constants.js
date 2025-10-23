/**
 * Special vote values for game outcomes
 */
export const VOTE_VALUES = {
  NOT_PLAYED: 'not_played',
}

/**
 * Threshold for minimum votes needed to end game without winner
 */
export const NOT_PLAYED_VOTE_THRESHOLD = 2

/**
 * Custom ID prefixes for Discord interactions
 */
export const CUSTOM_ID_PREFIXES = {
  JOIN_GAME: 'join_game_',
  LEAVE_GAME: 'leave_game_',
  FINISH_GAME: 'finish_game_',
  SETTINGS_POLL: 'settings_poll_',
  WINNER_SELECTION: 'winner_selection_',
}

/**
 * Required votes by player count to determine winner
 */
export const REQUIRED_VOTES_BY_PLAYER_COUNT = {
  4: 3,
  5: 3,
  6: 4,
}

/**
 * Timing configurations for game lifecycle (in milliseconds)
 */
export const TIMING = {
  THREAD_OPEN_TIME: 180000, // 3 minutes - Time before thread is locked after completion
  SETTINGS_SELECTION_TIME: 300000, // 5 minutes - Time allowed for players to vote on settings
  OLD_GAME_THRESHOLD: 14400000, // 4 hours - Games older than this are cleaned up
}

/**
 * Redis time-to-live for cached data (in seconds)
 */
export const REDIS_TTL = 7200 // 2 hours

/**
 * Default game creation values
 */
export const GAME_DEFAULTS = {
  PLAYER_COUNT: 4,
  ELO_REQUIREMENT: 0,
}
