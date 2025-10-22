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

  // Parallel operations: Check if player is already in a game and fetch player info
  const [existingGame, playerInfo] = await Promise.all([
    GetPlayerInGame(guildId, creatorId),
    FetchPlayerInfo(creatorId),
  ])

  // Check if player is already in a game
  if (existingGame) {
    throw new CreateGameError(
      'You are already in a game! Please leave it first before creating a new one.'
    )
  }

  // Validate player has Friends of Risk account
  const playerFoRProfile = playerInfo.profile
  if (playerFoRProfile === null) {
    throw new CreateGameError(
      'You need to link your account with Friends of Risk to create a game. Please visit https://friendsofrisk.com to get started.'
    )
  }

  // Validate player meets ELO requirement
  const playerElo = playerFoRProfile.elo
  if (playerElo < eloRequirement) {
    throw new CreateGameError(
      `Your ELO (${playerElo}) does not meet the minimum requirement (${eloRequirement}) to create this game!`
    )
  }

  // Get creator's display name for thread creation
  const creatorName = playerInfo.username || 'Player'

  // Create the game thread first
  const gameThreadId = await createGameThread(
    guildId,
    creatorName,
    playerCount,
    eloRequirement
  )

  // Now create ping message and send initial message in parallel
  const [pingMessage] = await Promise.all([
    sendPingMessageInChannel(
      guildId,
      gameThreadId,
      creatorId,
      playerCount,
      eloRequirement
    ),
    sendInitialMessage(gameThreadId, creatorId, playerCount),
    AddPlayerToThread(gameThreadId, creatorId),
    SetPlayerInGame(guildId, creatorId, gameThreadId),
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
 * @throws {Error} If any parameter is invalid
 */
function validateArguments(playerCount, eloRequirement) {
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
 * @returns {Promise<string>} The created thread ID
 * @throws {Error} If thread creation fails
 */
async function createGameThread(
  guildId,
  creatorName,
  playerCount,
  eloRequirement
) {
  console.log(`Creating game thread in guild: ${guildId}`)
  console.log(`Using lounge channel ID: ${CONFIG.loungeChannelId[guildId]}`)

  const result = await DiscordRequest(
    `channels/${CONFIG.loungeChannelId[guildId]}/threads`,
    {
      method: 'POST',
      body: {
        name: `${creatorName}'s Lounge Game - Players: ${playerCount}, ELO: ${eloRequirement}`,
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
 * @returns {Promise<Object>} The sent message object
 */
async function sendPingMessageInChannel(
  guildId,
  gameThreadId,
  creatorId,
  playerCount,
  eloRequirement
) {
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `<@&${CONFIG.loungeRoleId[guildId]}> New Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n\nUse the button below to join the game!`,
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
