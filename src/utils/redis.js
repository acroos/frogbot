import { createClient } from 'redis'
import CONFIG from '../config.js'
import { LockThread } from './discord.js'

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

export async function LockThreads() {
  for await (const gameKey of redisClient.scanIterator({MATCH: "game*"})) {
    const game = await redisClient.get(gameKey)

    if (game.winner) {
      await LockThread(game.gameThreadId)
    } else {
      console.log(`Found open game: ${game}`)
    }
  }
}

function gameIdToRedisKey(gameId) {
  return `game-${gameId}`
}
