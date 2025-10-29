import { MessageComponentTypes } from 'discord-interactions'
import CONFIG from '../config.js'
import {
  AddPlayerToThread,
  BuildGamePingComponents,
  SendMessageWithComponents,
  SendMessageWithContent,
  UpdateMessageWithComponents,
} from '../utils/discord.js'
import { FetchPlayerInfo } from '../utils/friends-of-risk.js'
import { AtomicJoinGame, GetGame, SetGame } from '../utils/redis.js'

export class JoinGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'JoinGameError'
  }
}

/**
 * Adds a player to an existing game
 * @param {string} guildId - The Discord guild ID
 * @param {string} playerId - The Discord user ID of the player joining
 * @param {string} gameId - The Discord thread ID of the game to join
 * @returns {Promise<void>}
 * @throws {JoinGameError} If player cannot join (already in game, game full, ELO requirement not met, etc.)
 */
export default async function JoinGame(guildId, playerId, gameId) {
  // First, fetch the game to do ELO validation (can't do this atomically)
  const game = await GetGame(gameId)
  if (!game) {
    throw new JoinGameError(`Game with ID ${gameId} not found.`)
  }

  // Validate ELO requirement if needed (this is the expensive operation we do outside the transaction)
  if (game.eloRequirement > 0) {
    const playerInfo = await FetchPlayerInfo(playerId)
    const playerElo = playerInfo?.ffa_elo_score || 0

    if (playerElo < game.eloRequirement) {
      throw new JoinGameError(
        `Player does not meet the ELO requirement. Current ELO: ${playerElo}, Required ELO: ${game.eloRequirement}.`
      )
    }
  }

  // ATOMIC OPERATION: Join the game using Redis transaction
  const result = await AtomicJoinGame(gameId, playerId)

  if (!result.success) {
    // Log the specific reason for better debugging
    console.log(
      `Player ${playerId} failed to join game ${gameId}: ${result.error}`
    )
    // Convert atomic operation errors to JoinGameError
    throw new JoinGameError(result.error)
  }

  console.log(
    `Player ${playerId} successfully joined game ${gameId}. Game now has ${result.game.players.length}/${result.game.playerCount} players`
  )
  const updatedGame = result.game

  // Safety check: Detect if somehow we still have too many players
  if (updatedGame.players.length > updatedGame.playerCount) {
    console.error(
      `RACE CONDITION DETECTED: Game ${gameId} has ${updatedGame.players.length} players but capacity is ${updatedGame.playerCount}. Players: ${updatedGame.players.join(', ')}`
    )
  }

  // Add player to Discord thread (this doesn't need to be atomic)
  await AddPlayerToThread(gameId, playerId)

  if (updatedGame.playerCount === updatedGame.players.length) {
    // Game is now full - send messages and update state in parallel
    await Promise.all([
      sendLobbyFullMessage(updatedGame),
      updatePingMessage(guildId, updatedGame),
      updateGameFilled(gameId, updatedGame),
    ])
  } else {
    // Game not full yet - send welcome message and update ping message
    await Promise.all([
      sendWelcomeMessage(updatedGame, playerId),
      updatePingMessage(guildId, updatedGame),
    ])
  }

  return updatedGame
}

/**
 * Sends the lobby full message with settings poll
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function sendLobbyFullMessage(game) {
  // Validate that we have settings options
  if (
    !game.settingsOptions ||
    !Array.isArray(game.settingsOptions) ||
    game.settingsOptions.length === 0
  ) {
    console.error(`Game ${game.gameThreadId} has no settings options available`)
    await SendMessageWithContent(
      game.gameThreadId,
      'Error: No settings options available for this game. Please contact an administrator.'
    )
    return
  }

  console.log(
    `Sending lobby full message for game ${game.gameThreadId} with ${game.settingsOptions.length} settings options`
  )

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content:
        'The game is full! Please select your preferred settings in the poll below.\n\nOnce all players have voted on their preferred settings, one will randomly be chosen and you may start the game.',
    },
    {
      type: MessageComponentTypes.MEDIA_GALLERY,
      items: game.settingsOptions.map((settingsOption) => ({
        media: {
          url: settingsOption.link,
        },
        description: `${settingsOption.map} ${settingsOption.cards} ${settingsOption.gametype} [#${settingsOption.settingid}]`,
      })),
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.STRING_SELECT,
          custom_id: `settings_poll_${game.gameThreadId}`,
          placeholder: 'Vote for your preferred settings',
          options: game.settingsOptions.map((settingsOption) => ({
            label: `${settingsOption.map} ${settingsOption.cards} ${settingsOption.gametype} [#${settingsOption.settingid}]`,
            value: settingsOption.settingid,
          })),
        },
      ],
    },
  ]

  try {
    await SendMessageWithComponents(game.gameThreadId, components)
    console.log(
      `Successfully sent lobby full message for game ${game.gameThreadId}`
    )
  } catch (error) {
    console.error(
      `Failed to send lobby full message for game ${game.gameThreadId}:`,
      error
    )
    // Send a fallback message
    await SendMessageWithContent(
      game.gameThreadId,
      'The game is full! There was an issue displaying the settings poll. Please contact an administrator.'
    )
  }
}

/**
 * Updates the ping message to show current game status
 * @param {string} guildId - The guild ID
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function updatePingMessage(guildId, game) {
  const components = BuildGamePingComponents(game, guildId, false)

  await UpdateMessageWithComponents(
    CONFIG.loungeChannelId[guildId],
    game.pingMessageId,
    components
  )
}

/**
 * Sends a welcome message to a player joining the game
 * @param {Object} game - The game object
 * @param {string} playerId - The player ID
 * @returns {Promise<void>}
 */
async function sendWelcomeMessage(game, playerId) {
  const currentPlayerCount = game.players.length

  const message = `Welcome to the game <@${playerId}>!\n\nHang tight for a few minutes while we wait for a full lobby.  We currently have ${currentPlayerCount} players here, we need ${game.playerCount} to start.`

  await SendMessageWithContent(game.gameThreadId, message)
}

/**
 * Updates game state to mark when it was filled
 * @param {string} gameId - The game thread ID
 * @param {Object} game - The game object
 * @returns {Promise<Object>} The updated game object
 */
async function updateGameFilled(gameId, game) {
  game.filledAt = Date.now()
  return await SetGame(gameId, game)
}
