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
