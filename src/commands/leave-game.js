import CONFIG from '../config.js'
import {
  BuildGamePingComponents,
  RemoveMessage,
  RemovePlayerFromThread,
  UpdateMessageWithComponents,
} from '../utils/discord.js'
import {
  GetGame,
  RemoveGame,
  RemovePlayerInGame,
  SetGame,
} from '../utils/redis.js'

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
  // Fetch the game from Redis
  const game = await GetGame(gameId)
  if (!game) {
    throw new LeaveGameError(`Could not find game with ID ${gameId}`)
  }

  if (game.selectedSettingId) {
    throw new LeaveGameError('Cannot leave a game after it has started')
  }

  // Remove player from game and their settings vote
  game.players = game.players.filter((player) => player !== playerId)
  delete game.settingsVotes[playerId]

  // Save updated game state
  const savedGame = await SetGame(gameId, game)
  if (!savedGame) {
    throw new LeaveGameError('Could not leave game')
  }

  // Execute all cleanup operations in parallel
  await Promise.all([
    RemovePlayerInGame(playerId),
    RemovePlayerFromThread(gameId, playerId),
    updateGamePingMessage(guildId, game),
    cancelGameIfEmpty(guildId, game),
  ])
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

/**
 * Cancels the game if no players remain
 * @param {string} guildId - The Discord guild ID
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function cancelGameIfEmpty(guildId, game) {
  const { players, pingMessageId, gameThreadId } = game
  if (players.length === 0) {
    await Promise.all([
      RemoveMessage(CONFIG.loungeChannelId[guildId], pingMessageId),
      RemoveGame(gameThreadId),
    ])
  }
}
