import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions'
import CONFIG from '../config.ts'
import { GAME_DEFAULTS } from '../constants.ts'
import {
  AddPlayerToThread,
  DiscordRequest,
  SendMessageWithComponents,
} from '../utils/discord.ts'
import { FetchPlayerInfo } from '../utils/friends-of-risk.ts'
import { GetPlayerInGame, SetGame, SetPlayerInGame } from '../utils/redis.ts'
import { GetRandomizedSettings } from '../utils/utils.ts'
import type { Game, DiscordMessage, GameSettings } from '../types/game.ts'

export class CreateGameError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CreateGameError'
  }
}

/**
 * Creates a new game with the specified parameters
 * @param guildId - The Discord guild ID where the game is being created
 * @param creatorId - The Discord user ID of the game creator
 * @param playerCount - Number of players (4-6), defaults to GAME_DEFAULTS.PLAYER_COUNT
 * @param eloRequirement - Minimum ELO required to join, defaults to GAME_DEFAULTS.ELO_REQUIREMENT
 * @returns The created game object
 * @throws {CreateGameError} If game creation fails due to validation or other errors
 */
export default async function CreateGame(
  guildId: string,
  creatorId: string,
  playerCount: number | null = null,
  eloRequirement: number | null = null
): Promise<Game> {
  // Use default values if not provided
  const finalPlayerCount = playerCount || GAME_DEFAULTS.PLAYER_COUNT
  const finalEloRequirement = eloRequirement || GAME_DEFAULTS.ELO_REQUIREMENT

  // Validate arguments
  validateArguments(finalPlayerCount, finalEloRequirement)

  // Parallel operations: Check if player is already in a game and fetch player info
  const [existingGame, playerInfo] = await Promise.all([
    GetPlayerInGame(creatorId),
    FetchPlayerInfo(creatorId),
  ])

  // Check if player is already in a game
  if (existingGame) {
    throw new CreateGameError(
      'You are already in a game! Please leave it first before creating a new one.'
    )
  }

  // Validate player meets ELO requirement
  const playerElo = playerInfo?.ffa_elo_score
  if (playerElo === undefined || playerElo < finalEloRequirement) {
    throw new CreateGameError(
      `Your ELO (${playerElo || 0}) does not meet the minimum requirement (${finalEloRequirement}) to create this game!`
    )
  }

  // Get creator's display name for thread creation
  const creatorName = playerInfo.name || 'Player'

  // Create the game thread first
  const gameThreadId = await createGameThread(
    guildId,
    creatorName,
    finalPlayerCount,
    finalEloRequirement
  )

  // Now create ping message and send initial message in parallel
  const [pingMessage] = await Promise.all([
    sendPingMessageInChannel(
      guildId,
      gameThreadId,
      creatorId,
      finalPlayerCount,
      finalEloRequirement
    ),
    sendInitialMessage(gameThreadId, creatorId, finalPlayerCount),
    AddPlayerToThread(gameThreadId, creatorId),
    SetPlayerInGame(creatorId, gameThreadId),
  ])

  // Fetch the settings players can vote on (synchronous operation)
  const settingsOptions = GetRandomizedSettings(finalPlayerCount) as GameSettings[]

  console.log('Settings options for the game:', JSON.stringify(settingsOptions))

  const newGame: Game = {
    gameThreadId: gameThreadId,
    creatorId: creatorId,
    settingsOptions: settingsOptions,
    playerCount: finalPlayerCount,
    eloRequirement: finalEloRequirement,
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

  if (!savedGame) {
    throw new CreateGameError('Failed to save game to database')
  }

  return savedGame as Game
}

/**
 * Validates the game creation parameters
 * @param playerCount - Number of players
 * @param eloRequirement - ELO requirement
 * @throws {Error} If any parameter is invalid
 */
function validateArguments(playerCount: number, eloRequirement: number): void {
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
 * Creates a Discord thread for the game
 * @param guildId - Guild ID
 * @param creatorName - Name of the game creator
 * @param playerCount - Number of players
 * @param eloRequirement - ELO requirement
 * @returns The created thread ID
 * @throws {Error} If thread creation fails
 */
async function createGameThread(
  guildId: string,
  creatorName: string,
  playerCount: number,
  eloRequirement: number
): Promise<string> {
  console.log(`Creating game thread in guild: ${guildId}`)
  const loungeChannelId = CONFIG.loungeChannelId[guildId as keyof typeof CONFIG.loungeChannelId]
  console.log(`Using lounge channel ID: ${loungeChannelId}`)

  const result = await DiscordRequest(
    `channels/${loungeChannelId}/threads`,
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

  const newThreadJson = (await result.json()) as { id: string }
  return newThreadJson.id
}

/**
 * Sends the ping message in the lounge channel to notify players
 * @param guildId - Guild ID
 * @param gameThreadId - Game thread ID
 * @param creatorId - Creator user ID
 * @param playerCount - Number of players
 * @param eloRequirement - ELO requirement
 * @returns The sent message object
 */
async function sendPingMessageInChannel(
  guildId: string,
  gameThreadId: string,
  creatorId: string,
  playerCount: number,
  eloRequirement: number
): Promise<DiscordMessage> {
  const loungeRoleId = CONFIG.loungeRoleId[guildId as keyof typeof CONFIG.loungeRoleId]
  const loungeChannelId = CONFIG.loungeChannelId[guildId as keyof typeof CONFIG.loungeChannelId]
  
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `<@&${loungeRoleId}> New Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n\nUse the button below to join the game!`,
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
  return (await SendMessageWithComponents(
    loungeChannelId,
    components
  )) as DiscordMessage
}

/**
 * Sends the initial message in the game thread
 * @param gameId - Game thread ID
 * @param creatorId - Creator user ID
 * @param playerCount - Number of players
 */
async function sendInitialMessage(
  gameId: string,
  creatorId: string,
  playerCount: number
): Promise<void> {
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
