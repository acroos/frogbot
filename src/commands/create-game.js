import {
  ButtonStyleTypes,
  MessageComponentTypes,
} from 'discord-interactions'
import CONFIG from '../config.js'
import {
  AddPlayerToThread,
  DiscordRequest,
  SendMessageWithComponents,
} from '../utils/discord.js'
import {
  FriendsOfRiskRequest,
  FetchPlayerInfo,
} from '../utils/friends-of-risk.js'
import { GetPlayerInGame, SetGame, SetPlayerInGame } from '../utils/redis.js'

export class CreateGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'CreateGameError'
  }
}

class EloRequirementNotMetError extends CreateGameError {
  constructor(playerElo, requiredElo) {
    super(
      `Your ELO (${playerElo}) does not meet the ELO requirement (${requiredElo}) requested for this game. Please create a game with a lower ELO requirement.`,
    )
    this.name = 'EloRequirementNotMetError'
  }
}

const DEFAULT_PLAYER_COUNT = 4 // Default player count
const DEFAULT_ELO_REQUIREMENT = 0 // Default ELO requirement
const DEFAULT_VOICE_CHAT = false // Default voice chat setting

export default async function CreateGame(
  guildId,
  creatorId,
  playerCount = null,
  eloRequirement = null,
  voiceChat = null
) {
  // Use default values if not provided
  playerCount = playerCount || DEFAULT_PLAYER_COUNT
  eloRequirement = eloRequirement || DEFAULT_ELO_REQUIREMENT
  voiceChat = voiceChat || DEFAULT_VOICE_CHAT

  // Validate arguments
  validateArguments(playerCount, eloRequirement, voiceChat)

  // Validate player is not already in game
  const creatorCurrentGame = await GetPlayerInGame(creatorId)
  if (creatorCurrentGame) {
    throw new CreateGameError(`Player ${creatorId} is already in game ${creatorCurrentGame}`)
  }

  const creatorPlayerInfo = await FetchPlayerInfo(creatorId)

  // Validate creator's ELO
  validateCreatorElo(creatorPlayerInfo, eloRequirement)

  // Create the game thread
  const gameThreadId = await createGameThread(guildId, creatorPlayerInfo.name, playerCount, eloRequirement, voiceChat)

  const promiseResults = await Promise.all([
    fetchSettingsOptions(playerCount), // Fetch the settings players can vote on
    sendInitialMessage(gameThreadId, creatorId, playerCount), // Send the initial message in the thread
    AddPlayerToThread(gameThreadId, creatorId), // Add the creator to the game thread
    sendPingMessageInChannel(guildId, gameThreadId, creatorId, playerCount, eloRequirement, voiceChat), // Send a ping message in the lounge channel to notify players
    SetPlayerInGame(creatorId, gameThreadId)
  ])

  const settingsOptions = promiseResults[0]
  const pingMessage = promiseResults[3]

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
  
  return savedGame // Save the game in Redis
}

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

function validateCreatorElo(creatorData, requiredElo) {
  if (requiredElo <= 0) return

  const creatorElo = creatorData?.ffa_elo_score || 0

  if (!creatorElo || creatorElo < requiredElo) {
    throw new EloRequirementNotMetError(creatorElo, requiredElo)
  }
}

async function createGameThread(
  guildId,
  creatorName,
  playerCount,
  eloRequirement,
  voiceChat
) {
  console.log(`Creating game thread in guild: ${guildId}`);
  console.log(`Using lounge channel ID: ${CONFIG.loungeChannelId[guildId]}`);
  // /channels/{channel.id}/threads
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
  // Return the thread ID for further use
  return newThreadJson.id
}

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
  return await SendMessageWithComponents(CONFIG.loungeChannelId[guildId], components)
}

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

async function fetchSettingsOptions(playerCount) {
  // Fetch the settings poll options from the Friends of Risk API
  const response = await FriendsOfRiskRequest(`getsettings`, {
    method: 'POST',
    body: { playercount: playerCount },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch settings poll options: ${response.statusText}`
    )
  }

  const data = await response.json()

  return data.settings
}
