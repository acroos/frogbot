import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from 'discord-interactions'
import CreateGame, { CreateGameError } from '../../../src/commands/create-game.js'
import FinishGame from '../../../src/commands/finish-game.js'
import JoinGame, { JoinGameError } from '../../../src/commands/join-game.js'
import LeaveGame, { LeaveGameError } from '../../../src/commands/leave-game.js'
import SettingsPollSelectionMade from '../../../src/commands/settings-poll-selection.js'
import WinnerSelection from '../../../src/commands/winner-selection.js'
import CONFIG from '../../../src/config.js'
import {
  ReadDiscordCommandOptionFromData,
  ReadGuildIdFromContext,
  ReadPlayerIdFromContext,
} from '../../../src/utils/discord.js'

async function handleCreateGameCommand(body) {
  const { data } = body
  const guildId = ReadGuildIdFromContext(body)
  const creatorId = ReadPlayerIdFromContext(body)
  const playerCount = ReadDiscordCommandOptionFromData(data, 'player_count')
  const eloRequirement = ReadDiscordCommandOptionFromData(
    data,
    'elo_requirement'
  )
  const voiceChat = ReadDiscordCommandOptionFromData(data, 'voice_chat')

  try {
    const game = await CreateGame(
      guildId,
      creatorId,
      playerCount,
      eloRequirement,
      voiceChat
    )

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Game created successfully! Game ID: ${game.gameThreadId}`,
      },
    }
  } catch (error) {
    if (error instanceof CreateGameError) {
      console.error('Error creating game:', error)
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: error.message,
        },
      }
    } else {
      throw error
    }
  }
}

async function handleJoinGameButton(body, customId) {
  const guildId = ReadGuildIdFromContext(body)
  const playerId = ReadPlayerIdFromContext(body)
  const gameId = customId.split('_')[2]

  try {
    await JoinGame(guildId, playerId, gameId)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `You have joined the game: <#${gameId}>.`,
      },
    }
  } catch (error) {
    if (error instanceof JoinGameError) {
      console.error(`JoinGameError: ${error.message}`)
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: error.message,
        },
      }
    } else {
      throw error
    }
  }
}

async function handleLeaveGameButton(body, customId) {
  const guildId = ReadGuildIdFromContext(body)
  const playerId = ReadPlayerIdFromContext(body)
  const gameId = customId.split('_')[2]

  try {
    await LeaveGame(guildId, playerId, gameId)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `You have left the game: ${gameId}.`,
      },
    }
  } catch (error) {
    if (error instanceof LeaveGameError) {
      console.error(`LeaveGameError: ${error.message}`)
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: error.message,
        },
      }
    } else {
      throw error
    }
  }
}

async function handleSettingsPollSelection(body, customId) {
  const { data } = body
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(body)
  const selectedSettingId = data.values[0]

  const voteCounted = await SettingsPollSelectionMade(
    threadId,
    playerId,
    selectedSettingId
  )

  if (voteCounted) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `You have selected settings #${selectedSettingId} for the game.`,
      },
    }
  } else {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Settings have already been finalized for this game. No further votes can be cast.`,
      },
    }
  }
}

async function handleWinnerPollSelection(body, customId) {
  const { data } = body
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(body)
  const winnerId = data.values[0]

  const selectionAccepted = await WinnerSelection(threadId, playerId, winnerId)

  if (selectionAccepted) {
    const responseContent =
      winnerId === 'not_played'
        ? 'Your vote that the game was not played has been counted'
        : `Your selection of <@${winnerId}> as winner has been counted`

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: responseContent,
      },
    }
  } else {
    const errorContent =
      winnerId === 'not_played'
        ? 'Your vote that the game was not played could not be counted. Please try again.'
        : `Your selection of <@${winnerId}> as winner could not be counted.  Please try again.`

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: errorContent,
      },
    }
  }
}

async function handleFinishGameButton(customId) {
  const gameId = customId.split('_')[2]
  const result = await FinishGame(gameId)

  if (result) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Game <#${gameId}> has been finished`,
      },
    }
  } else {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Game <#${gameId}> is already finished`,
      },
    }
  }
}

export async function POST(request) {
  // Get the raw body for signature verification
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  const rawBody = await request.text()

  // Verify the request
  const isValidRequest = verifyKey(rawBody, signature, timestamp, CONFIG.publicKey)

  if (!isValidRequest) {
    return new Response('Bad request signature', { status: 401 })
  }

  // Parse the body
  const body = JSON.parse(rawBody)
  const { id, type, data } = body

  // Handle verification requests
  if (type === InteractionType.PING) {
    return Response.json({ type: InteractionResponseType.PONG })
  }

  // Handle slash command requests
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data

    if (name === 'create_game' && id) {
      const response = await handleCreateGameCommand(body)
      return Response.json(response)
    }

    console.error(`unknown command: ${name}`)
    return Response.json({ error: 'unknown command' }, { status: 400 })
  }

  // Handle component interactions (buttons, select menus, etc.)
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data
    let response

    if (custom_id.startsWith('join_game_')) {
      response = await handleJoinGameButton(body, custom_id)
    } else if (custom_id.startsWith('settings_poll_')) {
      response = await handleSettingsPollSelection(body, custom_id)
    } else if (custom_id.startsWith('winner_selection_')) {
      response = await handleWinnerPollSelection(body, custom_id)
    } else if (custom_id.startsWith('leave_game_')) {
      response = await handleLeaveGameButton(body, custom_id)
    } else if (custom_id.startsWith('finish_game_')) {
      response = await handleFinishGameButton(custom_id)
    } else {
      console.error(`unknown component interaction: ${custom_id}`)
      return Response.json(
        { error: 'unknown component interaction' },
        { status: 400 }
      )
    }

    return Response.json(response)
  }

  console.error('unknown interaction type', type)
  return Response.json({ error: 'unknown interaction type' }, { status: 400 })
}
