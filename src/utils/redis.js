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
