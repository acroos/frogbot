import { createClient } from 'redis'
import CONFIG from '../config.js'
import { REDIS_TTL } from '../constants.js'
import type { Game } from '../types/game.ts'

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
 * @param gameId - The Discord thread ID of the game
 * @returns The game object or null if not found
 */
export async function GetGame(gameId: string): Promise<object | null> {
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
 * @param gameId - The Discord thread ID of the game
 * @param game - The game object to store
 * @returns The game object or null on error
 */
export async function SetGame(gameId: string, game: Game): Promise<object | null> {
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
 * @param gameId - The Discord thread ID of the game to remove
 */
export async function RemoveGame(gameId: string): Promise<void> {
  try {
    await redisClient.del(gameIdToRedisKey(gameId))
  } catch (error) {
    console.error('Error removing game', error)
  }
}

export async function GetFinalizedGames(): Promise<string[] | null> {
  const value = await redisClient.get(FINALIZED_GAMES_KEY)
  return value ? JSON.parse(value) : null
}

export async function SetFinalizedGames(gameIds: string[]): Promise<void> {
  try {
    await redisClient.set(FINALIZED_GAMES_KEY, JSON.stringify(gameIds))
  } catch (error) {
    console.error('Error setting finalized games', error)
  }
}

/**
 * Gets the game ID that a player is currently in
 * @param playerId - The Discord user ID
 * @returns The game ID or null if player not in a game
 */
export async function GetPlayerInGame(playerId: string): Promise<string | null> {
  return await redisClient.get(playerIdToActiveGameId(playerId))
}

/**
 * Records that a player is in a specific game
 * @param playerId - The Discord user ID
 * @param gameId - The Discord thread ID of the game
 */
export async function SetPlayerInGame(
  playerId: string,
  gameId: string
): Promise<void> {
  await redisClient.SETEX(playerIdToActiveGameId(playerId), REDIS_TTL, gameId)
}

/**
 * Removes the record of a player being in a game
 * @param playerId - The Discord user ID
 */
export async function RemovePlayerInGame(playerId: string): Promise<void> {
  await redisClient.del(playerIdToActiveGameId(playerId))
}

/**
 * Removes all players from a game's active game records
 * @param gameId - The Discord thread ID of the game
 * @throws {Error} If game is not found
 */
export async function RemoveAllPlayersInGame(gameId: string): Promise<void> {
  const gameData = await GetGame(gameId)
  if (!gameData) {
    throw new Error(`Could not find game with ID: ${gameId}`)
  }
  const game = gameData as Game
  for (const playerId of game.players) {
    await RemovePlayerInGame(playerId)
  }
}

export async function ScanMap(
  mapFunc: (parsed: unknown) => void
): Promise<void> {
  for await (const keys of redisClient.scanIterator()) {
    for (const key of keys) {
      const value = await redisClient.get(key)
      if (!value) continue
      const parsed = JSON.parse(value)

      mapFunc(parsed)
    }
  }
}

export async function MapToAllGames(mapFunc: (game: Game) => void | Promise<void>): Promise<void> {
  for await (const keys of redisClient.scanIterator({ MATCH: 'game-*' })) {
    for (const key of keys) {
      const value = await redisClient.get(key)
      if (!value) continue
      const parsed = JSON.parse(value)

      await mapFunc(parsed as Game)
    }
  }
}

function gameIdToRedisKey(gameId: string): string {
  return `game-${gameId}`
}

function playerIdToActiveGameId(playerId: string): string {
  return `active-player-${playerId}`
}
