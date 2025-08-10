import { RemovePlayerFromThread } from '../utils/discord.js'
import { GetGame, RemovePlayerInGame, SetGame } from '../utils/redis.js'

export class LeaveGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'LeaveGameError'
  }
}

// TODO:
// - Don't allow host to leave game
// - Remove player from thread
// - If last player leaves game, cancel game
export default async function LeaveGame(playerId, gameId) {
  // Fetch the game from Redis
  let game = await GetGame(gameId)
  if (!game) {
    throw new LeaveGameError(`Could not find game with ID ${gameId}`)
  }

  game.players = game.players.filter((player) => player !== playerId)
  delete game.settingsVotes[playerId]

  game = await SetGame(gameId, game)

  if (!game) {
    throw new LeaveGameError('Could not leave game')
  }

  const results = await Promise.all([
    RemovePlayerInGame(playerId),
    RemovePlayerFromThread(gameId, playerId),
  ])

  return results
}
