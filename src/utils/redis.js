import { createClient } from 'redis'
import CONFIG from '../config.js'
import { REDIS_TTL } from '../constants.js'

const FINALIZED_GAMES_KEY = 'finalized-games'

const redisClient = await createClient({
  socket: {
    host: CONFIG.redisHost,
    tls: true,
    rejectUnauthorized: false,
  },
})
  .on('error', (err) => console.log('Redis Client Error', err))
  .connect()

/**
 * Retrieves a game from Redis by game ID
 * @param {string} gameId - The Discord thread ID of the game
 * @returns {Promise<Object|null>} The game object or null if not found
 */
export async function GetGame(gameId) {
  const key = gameIdToRedisKey(gameId)
  try {
    const value = await redisClient.get(key)
    if (!value) {
      console.error(`Could not find game for key: ${key}`)
    }
    return value ? JSON.parse(value) : null
  } catch (error) {
    console.error('Error getting value from Redis:', error)
    return null
  }
}

/**
 * Stores or updates a game in Redis with TTL
 * @param {string} gameId - The Discord thread ID of the game
 * @param {Object} game - The game object to store
 * @returns {Promise<Object|null>} The game object or null on error
 */
export async function SetGame(gameId, game) {
  try {
    await redisClient.SETEX(
      gameIdToRedisKey(gameId),
      REDIS_TTL,
      JSON.stringify(game)
    )
  } catch (error) {
    console.error('Error setting value in Redis:', error)
    return null
  }
  return game
}

/**
 * Removes a game from Redis
 * @param {string} gameId - The Discord thread ID of the game to remove
 * @returns {Promise<void>}
 */
export async function RemoveGame(gameId) {
  try {
    await redisClient.del(gameIdToRedisKey(gameId))
  } catch (error) {
    console.error('Error removing game', error)
  }
}

export async function GetFinalizedGames() {
  const value = await redisClient.get(FINALIZED_GAMES_KEY)
  return JSON.parse(value)
}

export async function SetFinalizedGames(gameIds) {
  try {
    await redisClient.set(FINALIZED_GAMES_KEY, JSON.stringify(gameIds))
  } catch (error) {
    console.error('Error setting finalized games', error)
  }
}

/**
 * Checks if a player is currently in a valid game
 * Automatically cleans up stale records if the game no longer exists
 * @param {string} playerId - The Discord user ID
 * @returns {Promise<boolean>} True if player is in a valid game, false otherwise
 */
export async function IsPlayerInGame(playerId) {
  const gameId = await redisClient.get(playerIdToActiveGameId(playerId))
  if (!gameId) {
    return false
  }

  // Verify the game still exists
  const game = await GetGame(gameId)
  if (!game) {
    // Game no longer exists - clean up the stale player record
    await RemovePlayerInGame(playerId)
    return false
  }

  // Verify player is actually in the game's player list
  if (!game.players || !game.players.includes(playerId)) {
    // Player not in game - clean up the stale record
    await RemovePlayerInGame(playerId)
    return false
  }

  return true
}

/**
 * Records that a player is in a specific game
 * @param {string} playerId - The Discord user ID
 * @param {string} gameId - The Discord thread ID of the game
 * @returns {Promise<void>}
 */
export async function SetPlayerInGame(playerId, gameId) {
  await redisClient.SETEX(playerIdToActiveGameId(playerId), REDIS_TTL, gameId)
}

/**
 * Removes the record of a player being in a game
 * @param {string} playerId - The Discord user ID
 * @returns {Promise<void>}
 */
export async function RemovePlayerInGame(playerId) {
  await redisClient.del(playerIdToActiveGameId(playerId))
}

/**
 * Removes all players from a game's active game records
 * @param {string} gameId - The Discord thread ID of the game
 * @returns {Promise<void>}
 * @throws {Error} If game is not found
 */
export async function RemoveAllPlayersInGame(gameId) {
  const game = await GetGame(gameId)
  if (!game) {
    throw new Error(`Could not find game with ID: ${gameId}`)
  }
  for (let playerId of game.players) {
    await RemovePlayerInGame(playerId)
  }
}

/**
 * Atomically adds a player to a game using Redis transactions
 * @param {string} gameId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the player
 * @returns {Promise<{success: boolean, game: Object|null, error: string|null}>}
 */
export async function AtomicJoinGame(gameId, playerId) {
  const gameKey = gameIdToRedisKey(gameId)
  const playerKey = playerIdToActiveGameId(playerId)

  try {
    // Watch the game for changes
    await redisClient.watch(gameKey)

    // Get current game state
    const gameData = await redisClient.get(gameKey)
    if (!gameData) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Game not found' }
    }

    const game = JSON.parse(gameData)

    // Validation checks
    if (game.players.includes(playerId)) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Player already in game' }
    }

    if (game.players.length >= game.playerCount) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Game is full' }
    }

    if (game.selectedSettingId) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Game has already started' }
    }

    // Prepare updated game state
    const updatedGame = { ...game }
    updatedGame.players = [...game.players, playerId]

    // Execute transaction
    const multi = redisClient.multi()
    multi.setEx(gameKey, REDIS_TTL, JSON.stringify(updatedGame))
    multi.setEx(playerKey, REDIS_TTL, gameId)

    const results = await multi.exec()

    if (!results) {
      // Transaction was aborted due to watched key being modified
      return {
        success: false,
        game: null,
        error: 'Game state changed during join, please try again',
      }
    }

    return { success: true, game: updatedGame, error: null }
  } catch (error) {
    console.error('Error in AtomicJoinGame:', error)
    await redisClient.unwatch()
    return { success: false, game: null, error: 'Database error' }
  }
}

/**
 * Atomically removes a player from a game using Redis transactions
 * @param {string} gameId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the player
 * @returns {Promise<{success: boolean, game: Object|null, error: string|null}>}
 */
export async function AtomicLeaveGame(gameId, playerId) {
  const gameKey = gameIdToRedisKey(gameId)
  const playerKey = playerIdToActiveGameId(playerId)

  try {
    // Watch the game for changes
    await redisClient.watch(gameKey)

    // Get current game state
    const gameData = await redisClient.get(gameKey)
    if (!gameData) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Game not found' }
    }

    const game = JSON.parse(gameData)

    // Validation checks
    if (!game.players.includes(playerId)) {
      await redisClient.unwatch()
      return { success: false, game: null, error: 'Player not in game' }
    }

    if (game.selectedSettingId) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        error: 'Cannot leave after game has started',
      }
    }

    // Prepare updated game state
    const updatedGame = { ...game }
    updatedGame.players = game.players.filter((id) => id !== playerId)
    delete updatedGame.settingsVotes[playerId]

    // Clear filledAt if game is no longer full
    if (
      updatedGame.filledAt &&
      updatedGame.players.length < updatedGame.playerCount
    ) {
      updatedGame.filledAt = undefined
    }

    // Execute transaction
    const multi = redisClient.multi()

    if (updatedGame.players.length === 0) {
      // Remove game entirely if no players left
      multi.del(gameKey)
    } else {
      // Update game with remaining players
      multi.setEx(gameKey, REDIS_TTL, JSON.stringify(updatedGame))
    }

    multi.del(playerKey)

    const results = await multi.exec()

    if (!results) {
      // Transaction was aborted due to watched key being modified
      return {
        success: false,
        game: null,
        error: 'Game state changed during leave, please try again',
      }
    }

    return { success: true, game: updatedGame, error: null }
  } catch (error) {
    console.error('Error in AtomicLeaveGame:', error)
    await redisClient.unwatch()
    return { success: false, game: null, error: 'Database error' }
  }
}

/**
 * Atomically records a vote for game settings using Redis transactions
 * @param {string} gameId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the voting player
 * @param {Object} settingsChoice - The selected settings object
 * @returns {Promise<{success: boolean, game: Object|null, shouldFinalize: boolean, error: string|null}>}
 */
export async function AtomicVoteSettings(gameId, playerId, settingsChoice) {
  const gameKey = gameIdToRedisKey(gameId)

  try {
    // Watch the game for changes
    await redisClient.watch(gameKey)

    // Get current game state
    const gameData = await redisClient.get(gameKey)
    if (!gameData) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        error: 'Game not found',
      }
    }

    const game = JSON.parse(gameData)

    // Validation checks
    if (game.selectedSettingId) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        error: 'Settings already finalized',
      }
    }

    if (game.settingsVotes[playerId]) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        error: 'Player already voted',
      }
    }

    // Prepare updated game state
    const updatedGame = { ...game }
    updatedGame.settingsVotes = { ...game.settingsVotes }
    updatedGame.settingsVotes[playerId] = settingsChoice

    // Check if we should finalize settings
    const voteCount = Object.keys(updatedGame.settingsVotes).length
    const shouldFinalize = voteCount === updatedGame.playerCount

    if (shouldFinalize) {
      // Randomly select from votes
      const votes = Object.values(updatedGame.settingsVotes)
      const selectedSettings = votes[Math.floor(Math.random() * votes.length)]
      updatedGame.selectedSettingId = selectedSettings.settingid
    }

    // Execute transaction
    const multi = redisClient.multi()
    multi.setEx(gameKey, REDIS_TTL, JSON.stringify(updatedGame))

    const results = await multi.exec()

    if (!results) {
      // Transaction was aborted due to watched key being modified
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        error: 'Game state changed during vote, please try again',
      }
    }

    return { success: true, game: updatedGame, shouldFinalize, error: null }
  } catch (error) {
    console.error('Error in AtomicVoteSettings:', error)
    await redisClient.unwatch()
    return {
      success: false,
      game: null,
      shouldFinalize: false,
      error: 'Database error',
    }
  }
}

/**
 * Atomically records a winner vote using Redis transactions
 * @param {string} gameId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the voting player
 * @param {string} winnerId - The Discord user ID of the winner or special value
 * @returns {Promise<{success: boolean, game: Object|null, shouldFinalize: boolean, winner: string|null, error: string|null}>}
 */
export async function AtomicVoteWinner(gameId, playerId, winnerId) {
  const gameKey = gameIdToRedisKey(gameId)

  try {
    // Watch the game for changes
    await redisClient.watch(gameKey)

    // Get current game state
    const gameData = await redisClient.get(gameKey)
    if (!gameData) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        reason: null,
        error: 'Game not found',
      }
    }

    const game = JSON.parse(gameData)

    // Validation checks
    if (game.winner) {
      await redisClient.unwatch()
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        reason: null,
        error: 'Game already has a winner',
      }
    }

    if (game.winnerVotes[playerId]) {
      await redisClient.unwatch()
      return {
        success: true,
        game,
        shouldFinalize: false,
        reason: null,
        error: 'Player already voted',
      }
    }

    // Import constants - these should match your constants.js
    const VOTE_VALUES = { NOT_PLAYED: 'not-played' }
    const NOT_PLAYED_VOTE_THRESHOLD = 2
    const REQUIRED_VOTES_BY_PLAYER_COUNT = { 4: 3, 5: 3, 6: 4 }

    // Prepare updated game state
    const updatedGame = { ...game }
    updatedGame.winnerVotes = { ...game.winnerVotes }
    updatedGame.winnerVotes[playerId] = winnerId

    const voteCount = Object.keys(updatedGame.winnerVotes).length
    const requiredVotes =
      REQUIRED_VOTES_BY_PLAYER_COUNT[updatedGame.playerCount] ||
      Math.ceil(updatedGame.playerCount * 0.6)

    // Count "not played" votes
    const notPlayedVotes = Object.values(updatedGame.winnerVotes).filter(
      (vote) => vote === VOTE_VALUES.NOT_PLAYED
    ).length

    let shouldFinalize = false
    let reason = null

    // Check finalization conditions
    if (notPlayedVotes >= NOT_PLAYED_VOTE_THRESHOLD) {
      shouldFinalize = true
      reason = 'not_played'
    } else if (voteCount >= requiredVotes) {
      // Filter out "not played" votes when determining winner
      const playerVotes = Object.values(updatedGame.winnerVotes).filter(
        (vote) => vote !== VOTE_VALUES.NOT_PLAYED
      )

      // Determine winner using same logic as original function
      let voteCounts = {}
      let winner = null

      for (let vote of playerVotes) {
        voteCounts[vote] = (voteCounts[vote] || 0) + 1
        if (voteCounts[vote] >= requiredVotes) {
          winner = vote
          break
        }
      }

      if (winner === null && voteCount === updatedGame.playerCount) {
        shouldFinalize = true
        reason = 'no_majority'
      } else if (winner !== null) {
        updatedGame.winner = winner
        shouldFinalize = true
        reason = 'winner_determined'
      }
    }

    // Execute transaction
    const multi = redisClient.multi()
    multi.setEx(gameKey, REDIS_TTL, JSON.stringify(updatedGame))

    const results = await multi.exec()

    if (!results) {
      // Transaction was aborted due to watched key being modified
      return {
        success: false,
        game: null,
        shouldFinalize: false,
        reason: null,
        error: 'Game state changed during vote, please try again',
      }
    }

    console.log(
      `Player ${playerId} voted for winner ${winnerId} in game ${gameId}`
    )
    return {
      success: true,
      game: updatedGame,
      shouldFinalize,
      reason,
      error: null,
    }
  } catch (error) {
    console.error('Error in AtomicVoteWinner:', error)
    await redisClient.unwatch()
    return {
      success: false,
      game: null,
      shouldFinalize: false,
      reason: null,
      error: 'Database error',
    }
  }
}

export async function ScanMap(mapFunc) {
  for await (const keys of redisClient.scanIterator()) {
    for (const key of keys) {
      const value = await redisClient.get(key)
      const parsed = JSON.parse(value)

      mapFunc(parsed)
    }
  }
}

export async function MapToAllGames(mapFunc) {
  for await (const keys of redisClient.scanIterator({ MATCH: 'game-*' })) {
    for (const key of keys) {
      const value = await redisClient.get(key)
      const parsed = JSON.parse(value)

      mapFunc(parsed)
    }
  }
}

function gameIdToRedisKey(gameId) {
  return `game-${gameId}`
}

function playerIdToActiveGameId(playerId) {
  return `active-player-${playerId}`
}
