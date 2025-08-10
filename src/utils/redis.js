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
  for await (const keys of redisClient.scanIterator()) {
    for(const key of keys) {
      const value = await redisClient.get(key)

      const game = JSON.parse(value)
      if (game.winner) {
        console.log(`Found finished game: ${game.gameThreadId}`)
        const response = await LockThread(game.gameThreadId)
        if (!response.ok) {
          console.log(`Could not lock game: ${game.gameThreadId}`)
        }
      }
    }
  }
}

function gameIdToRedisKey(gameId) {
  return `game-${gameId}`
}
