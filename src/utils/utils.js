import { CloseThread, LockThread } from './discord.js'
import {
  GetFinalizedGames,
  RemoveGame,
  ScanMap,
  SetFinalizedGames,
} from './redis.js'

const THREAD_OPEN_TIME = 180000 // 3 minutes in ms

export function FinalizeGames() {
  const startTime = Date.now()

  const finalizedGames = []
  ScanMap(async (game) => {
    if (gameShouldFinalize(startTime, game.completedAt)) {
      const response = await LockThread(game.gameThreadId)
      if (!response.ok) {
        console.log(`Could not lock game thread: ${game.gameThreadId}`)
      }
      finalizedGames.push(game.gameThreadId)
    }
  })
    .then(async () => {
      await SetFinalizedGames(finalizedGames)
      console.log('Finalized games!')
    })
    .catch((error) => {
      console.error('Error finalizing games: ', error)
    })
}

export async function CleanUpFinalizedGames() {
  GetFinalizedGames().then((gameIds) => {
    for (let gameId of gameIds) {
      CloseThread(gameId)
        .then(async () => {
          await RemoveGame(gameId)
        })
        .catch((error) => {
          console.error('Error cleaning up finalized games: ', error)
        })
    }
  })
}

function gameShouldFinalize(startTime, completionTime) {
  if (!completionTime) {
    return false
  }

  return startTime - completionTime > THREAD_OPEN_TIME
}
