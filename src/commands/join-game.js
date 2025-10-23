import { MessageComponentTypes } from 'discord-interactions'
import {
  AddPlayerToThread,
  SendMessageWithComponents,
  SendMessageWithContent,
  UpdateMessageWithComponents,
} from '../utils/discord.js'
import { FetchPlayerInfo } from '../utils/friends-of-risk.js'
import {
  GetGame,
  GetPlayerInGame,
  SetGame,
  SetPlayerInGame,
} from '../utils/redis.js'
import CONFIG from '../config.js'

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
  // Fetch the game from Redis
  const game = await GetGame(gameId)
  if (!game) {
    throw new JoinGameError(`Game with ID ${gameId} not found.`)
  }

  // Validate player is allowed to join game (may fetch player info if needed)
  await validateJoinGameConditions(game, playerId)

  // Add player to thread and mark as in game (parallel execution)
  await Promise.all([
    AddPlayerToThread(gameId, playerId),
    SetPlayerInGame(playerId, gameId),
  ])

  // Add player to the game and update in Redis
  game.players.push(playerId)
  await SetGame(gameId, game)

  if (game.playerCount === game.players.length) {
    // Game is now full - send messages and update state in parallel
    await Promise.all([
      sendLobbyFullMessage(game),
      updatePingMessage(guildId, game),
      updateGameFilled(gameId, game),
    ])
  } else {
    await sendWelcomeMessage(game, playerId)
  }

  return game
}

/**
 * Validates that a player can join the game
 * @param {Object} game - The game object
 * @param {string} playerId - The player ID
 * @returns {Promise<void>}
 * @throws {JoinGameError} If player cannot join
 */
async function validateJoinGameConditions(game, playerId) {
  const gameId = game.gameThreadId

  // Run independent validations in parallel
  const [playerAlreadyInGame, playerInfo] = await Promise.all([
    GetPlayerInGame(playerId),
    game.eloRequirement > 0 ? FetchPlayerInfo(playerId) : Promise.resolve(null),
  ])

  // Validate if player is already in a game
  if (playerAlreadyInGame) {
    throw new JoinGameError(`Player ${playerId} is already in game ${gameId}`)
  }

  // Validate if game is already full
  if (game.players.length === game.playerCount) {
    throw new JoinGameError(`Game with ID ${gameId} is already full.`)
  }

  // Validate player's ELO if required
  if (game.eloRequirement != 0) {
    const playerElo = playerInfo?.ffa_elo_score || 0

    if (playerElo < game.eloRequirement) {
      throw new JoinGameError(
        `Player does not meet the ELO requirement. Current ELO: ${playerElo}, Required ELO: ${game.eloRequirement}.`
      )
    }
  }
}

/**
 * Sends the lobby full message with settings poll
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function sendLobbyFullMessage(game) {
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
  await SendMessageWithComponents(game.gameThreadId, components)
}

/**
 * Updates the ping message to indicate game is full
 * @param {string} guildId - The guild ID
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function updatePingMessage(guildId, game) {
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `Risk Competitive Lounge game created by <@${game.creatorId}>!\n- Player Count: ${game.playerCount}\n- ELO Requirement: ${game.eloRequirement}\n\nGame has filled, keep an eye out for the next one or start your own with the \`/create_game\` command`,
    },
  ]

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
