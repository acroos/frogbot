import { createClient } from 'redis'
import CONFIG from '../config.js'

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

export async function SetGame(gameId, game) {
  try {
    await redisClient.set(gameIdToRedisKey(gameId), JSON.stringify(game))
  } catch (error) {
    console.error('Error setting value in Redis:', error)
    return null
  }
  return game
}

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

export async function GetPlayerInGame(playerId) {
  return await redisClient.get(playerIdToActiveGameId(playerId))
}

export async function SetPlayerInGame(playerId, gameId) {
  await redisClient.set(playerIdToActiveGameId(playerId), gameId)
}

export async function RemovePlayerInGame(playerId) {
  await redisClient.del(playerIdToActiveGameId(playerId))
}

export async function RemoveAllPlayersInGame(gameId) {
  const game = await GetGame(gameId)
  if (!game) {
    throw new Error(`Could not find game with ID: ${gameId}`)
  }
  for(let playerId of game.players) {
    await RemovePlayerInGame(playerId)
  }
}

export async function ScanMap(mapFunc) {
  for await (const keys of redisClient.scanIterator()) {
    for(const key of keys) {
      const value = await redisClient.get(key)
      const parsed = JSON.parse(value)

      mapFunc(parsed)
    }
  }
}

export async function MapToAllGames(mapFunc) {
  for await (const keys of redisClient.scanIterator({MATCH: "game-*"})) {
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
