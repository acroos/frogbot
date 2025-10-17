import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions'
import CONFIG from '../config.js'
import { GAME_DEFAULTS } from '../constants.js'
import {
  AddPlayerToThread,
  DiscordRequest,
  SendMessageWithComponents,
} from '../utils/discord.js'
import { FetchPlayerInfo } from '../utils/friends-of-risk.js'
import { GetPlayerInGame, SetGame, SetPlayerInGame } from '../utils/redis.js'
import { GetRandomizedSettings } from '../utils/utils.js'

export class CreateGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'CreateGameError'
  }
}

class EloRequirementNotMetError extends CreateGameError {
  constructor(playerElo, requiredElo) {
    super(
      `Your ELO (${playerElo}) does not meet the ELO requirement (${requiredElo}) requested for this game. Please create a game with a lower ELO requirement.`
    )
    this.name = 'EloRequirementNotMetError'
  }
}

/**
 * Creates a new game with the specified parameters
 * @param {string} guildId - The Discord guild ID where the game is being created
 * @param {string} creatorId - The Discord user ID of the game creator
 * @param {number|null} playerCount - Number of players (4-6), defaults to GAME_DEFAULTS.PLAYER_COUNT
 * @param {number|null} eloRequirement - Minimum ELO required to join, defaults to GAME_DEFAULTS.ELO_REQUIREMENT
 * @returns {Promise<Object>} The created game object
 * @throws {CreateGameError} If game creation fails due to validation or other errors
 */
export default async function CreateGame(
  guildId,
  creatorId,
  playerCount = null,
  eloRequirement = null
) {
  // Use default values if not provided
  playerCount = playerCount || GAME_DEFAULTS.PLAYER_COUNT
  eloRequirement = eloRequirement || GAME_DEFAULTS.ELO_REQUIREMENT

  // Validate arguments
  validateArguments(playerCount, eloRequirement)

  // Validate player is not already in game and fetch player info (parallel)
  const [creatorCurrentGame, creatorPlayerInfo] = await Promise.all([
    GetPlayerInGame(creatorId),
    FetchPlayerInfo(creatorId),
  ])

  if (creatorCurrentGame) {
    throw new CreateGameError(
      `Player ${creatorId} is already in game ${creatorCurrentGame}`
    )
  }

  // Validate creator's ELO
  validateCreatorElo(creatorPlayerInfo, eloRequirement)

  // Create the game thread
  const gameThreadId = await createGameThread(
    guildId,
    creatorPlayerInfo.name,
    playerCount,
    eloRequirement,
    voiceChat
  )

  // Execute all setup tasks in parallel
  const [, , pingMessage] = await Promise.all([
    sendInitialMessage(gameThreadId, creatorId, playerCount),
    AddPlayerToThread(gameThreadId, creatorId),
    sendPingMessageInChannel(
      guildId,
      gameThreadId,
      creatorId,
      playerCount,
      eloRequirement,
      voiceChat
    ),
    SetPlayerInGame(creatorId, gameThreadId),
  ])

  // Fetch the settings players can vote on (synchronous operation)
  const settingsOptions = GetRandomizedSettings(playerCount)

  console.log('Settings options for the game:', JSON.stringify(settingsOptions))

  const newGame = {
    gameThreadId: gameThreadId,
    creatorId: creatorId,
    settingsOptions: settingsOptions,
    playerCount: playerCount,
    eloRequirement: eloRequirement,
    voiceChat: voiceChat,
    players: [creatorId],
    selectedSettingId: undefined,
    settingsVotes: {},
    winnerVotes: {},
    pingMessageId: pingMessage.id,
    winner: undefined,
    completedAt: undefined,
    createdAt: Date.now(),
    filledAt: undefined,
  }

  const savedGame = await SetGame(gameThreadId, newGame)

  return savedGame
}

/**
 * Validates the game creation parameters
 * @param {number} playerCount - Number of players
 * @param {number} eloRequirement - ELO requirement
 * @param {boolean} voiceChat - Voice chat setting
 * @throws {Error} If any parameter is invalid
 */
function validateArguments(playerCount, eloRequirement, voiceChat) {
  if (playerCount < 4 || playerCount > 6) {
    throw new Error(
      `Invalid player count: ${playerCount}. Must be between 4 and 6.`
    )
  }

  if (typeof eloRequirement !== 'number') {
    throw new Error(
      `Invalid ELO requirement: ${eloRequirement}. Must be a number.`
    )
  }

  if (typeof voiceChat !== 'boolean') {
    throw new Error(
      `Invalid voice chat setting: ${voiceChat}. Must be a boolean.`
    )
  }
}

/**
 * Validates that the creator meets the ELO requirement
 * @param {Object} creatorData - Creator's player info
 * @param {number} requiredElo - Minimum ELO requirement
 * @throws {EloRequirementNotMetError} If creator's ELO is below requirement
 */
function validateCreatorElo(creatorData, requiredElo) {
  if (requiredElo <= 0) return

  const creatorElo = creatorData?.ffa_elo_score || 0

  if (!creatorElo || creatorElo < requiredElo) {
    throw new EloRequirementNotMetError(creatorElo, requiredElo)
  }
}

/**
 * Creates a Discord thread for the game
 * @param {string} guildId - Guild ID
 * @param {string} creatorName - Name of the game creator
 * @param {number} playerCount - Number of players
 * @param {number} eloRequirement - ELO requirement
 * @param {boolean} voiceChat - Voice chat requirement
 * @returns {Promise<string>} The created thread ID
 * @throws {Error} If thread creation fails
 */
async function createGameThread(
  guildId,
  creatorName,
  playerCount,
  eloRequirement,
  voiceChat
) {
  console.log(`Creating game thread in guild: ${guildId}`)
  console.log(`Using lounge channel ID: ${CONFIG.loungeChannelId[guildId]}`)

  const result = await DiscordRequest(
    `channels/${CONFIG.loungeChannelId[guildId]}/threads`,
    {
      method: 'POST',
      body: {
        name: `${creatorName}'s Lounge Game - Players: ${playerCount}, ELO: ${eloRequirement}, Voice: ${voiceChat ? 'Yes' : 'No'}`,
        type: 12, // Private thread
        invitable: false, // Players cannot invite others
      },
    }
  )

  if (!result.ok) {
    throw new Error(`Failed to create game thread: ${result.statusText}`)
  }

  const newThreadJson = await result.json()
  return newThreadJson.id
}

/**
 * Sends the ping message in the lounge channel to notify players
 * @param {string} guildId - Guild ID
 * @param {string} gameThreadId - Game thread ID
 * @param {string} creatorId - Creator user ID
 * @param {number} playerCount - Number of players
 * @param {number} eloRequirement - ELO requirement
 * @param {boolean} voiceChat - Voice chat requirement
 * @returns {Promise<Object>} The sent message object
 */
async function sendPingMessageInChannel(
  guildId,
  gameThreadId,
  creatorId,
  playerCount,
  eloRequirement,
  voiceChat
) {
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `<@&${CONFIG.loungeRoleId[guildId]}> New Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n- Voice Chat: ${voiceChat ? 'Enabled' : 'Disabled'}\n\nUse the button below to join the game!`,
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `join_game_${gameThreadId}`,
          label: 'Join Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    },
  ]
  return await SendMessageWithComponents(
    CONFIG.loungeChannelId[guildId],
    components
  )
}

/**
 * Sends the initial message in the game thread
 * @param {string} gameId - Game thread ID
 * @param {string} creatorId - Creator user ID
 * @param {number} playerCount - Number of players
 * @returns {Promise<void>}
 */
async function sendInitialMessage(gameId, creatorId, playerCount) {
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `## New game created by <@${creatorId}>\n\nSit tight for now, once ${playerCount} players are here, we'll vote on the settings to play.\n\nIf you need to leave the game, click the button below.`,
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `leave_game_${gameId}`,
          label: 'Leave Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    },
  ]
  await SendMessageWithComponents(gameId, components)
}
