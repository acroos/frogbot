import { createClient } from 'redis'

const redisClient = await createClient()
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
  }
  return game
}

function gameIdToRedisKey(gameId) {
  return `game-${gameId}`;
}