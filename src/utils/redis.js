import { createClient } from 'redis'
import CONFIG from '../config.js'

const FINALIZED_GAMES_KEY = 'finalized-games'

let redisClient = null
let connectingPromise = null

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient
  }
  
  if (connectingPromise) {
    return connectingPromise
  }
  
  connectingPromise = createClient({
    socket: {
      host: CONFIG.redisHost,
      tls: CONFIG.redisUseTLS,
      rejectUnauthorized: false,
    },
  })
    .on('error', (err) => console.log('Redis Client Error', err))
    .connect()
  
  redisClient = await connectingPromise
  connectingPromise = null
  return redisClient
}

export async function GetGame(gameId) {
  const client = await getRedisClient()
  const key = gameIdToRedisKey(gameId)
  try {
    const value = await client.get(key)
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
  const client = await getRedisClient()
  try {
    await client.SETEX(
      gameIdToRedisKey(gameId),
      7200,
      JSON.stringify(game)
    ) // Set with 2 hour expiration
  } catch (error) {
    console.error('Error setting value in Redis:', error)
    return null
  }
  return game
}

export async function RemoveGame(gameId) {
  const client = await getRedisClient()
  try {
    await client.del(gameIdToRedisKey(gameId))
  } catch (error) {
    console.error('Error removing game', error)
  }
}

export async function GetFinalizedGames() {
  const client = await getRedisClient()
  const value = await client.get(FINALIZED_GAMES_KEY)
  return JSON.parse(value)
}

export async function SetFinalizedGames(gameIds) {
  const client = await getRedisClient()
  try {
    await client.set(FINALIZED_GAMES_KEY, JSON.stringify(gameIds))
  } catch (error) {
    console.error('Error setting finalized games', error)
  }
}

export async function GetPlayerInGame(playerId) {
  const client = await getRedisClient()
  return await client.get(playerIdToActiveGameId(playerId))
}

export async function SetPlayerInGame(playerId, gameId) {
  const client = await getRedisClient()
  await client.SETEX(playerIdToActiveGameId(playerId), 7200, gameId) // Set with 2 hour expiration
}

export async function RemovePlayerInGame(playerId) {
  const client = await getRedisClient()
  await client.del(playerIdToActiveGameId(playerId))
}

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
  const client = await getRedisClient()
  for await (const keys of client.scanIterator()) {
    for (const key of keys) {
      const value = await client.get(key)
      const parsed = JSON.parse(value)

      mapFunc(parsed)
    }
  }
}

export async function MapToAllGames(mapFunc) {
  const client = await getRedisClient()
  for await (const keys of client.scanIterator({ MATCH: 'game-*' })) {
    for (const key of keys) {
      const value = await client.get(key)
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
