import CONFIG from '../config.js'
import {
  BuildGamePingComponents,
  RemoveMessage,
  RemovePlayerFromThread,
  UpdateMessageWithComponents,
} from '../utils/discord.js'
import { AtomicLeaveGame } from '../utils/redis.js'

export class LeaveGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'LeaveGameError'
  }
}

/**
 * Removes a player from a game they previously joined
 * @param {string} guildId - The Discord guild ID
 * @param {string} playerId - The Discord user ID of the player leaving
 * @param {string} gameId - The Discord thread ID of the game to leave
 * @returns {Promise<void>}
 * @throws {LeaveGameError} If player cannot leave (not in game, game not found, etc.)
 */
// TODO:
// - If last player leaves game, cancel game
export default async function LeaveGame(guildId, playerId, gameId) {
  // ATOMIC OPERATION: Leave the game using Redis transaction
  const result = await AtomicLeaveGame(gameId, playerId)

  if (!result.success) {
    throw new LeaveGameError(result.error)
  }

  const updatedGame = result.game

  // Execute cleanup operations in parallel
  if (updatedGame.players.length === 0) {
    // Game was completely removed - just clean up Discord
    await Promise.all([
      RemovePlayerFromThread(gameId, playerId),
      RemoveMessage(CONFIG.loungeChannelId[guildId], updatedGame.pingMessageId),
    ])
  } else {
    // Game still has players - update ping message and clean up Discord
    await Promise.all([
      RemovePlayerFromThread(gameId, playerId),
      updateGamePingMessage(guildId, updatedGame),
    ])
  }
}

/**
 * Updates the ping message in the lounge channel after player leaves
 * @param {string} guildId - The Discord guild ID
 * @param {Object} game - The game object
 * @returns {Promise<Object>} The updated message response
 */
async function updateGamePingMessage(guildId, game) {
  const components = BuildGamePingComponents(game, guildId, false)

  return await UpdateMessageWithComponents(
    CONFIG.loungeChannelId[guildId],
    game.pingMessageId,
    components
  )
}
