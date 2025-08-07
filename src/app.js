import express from 'express'
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions'
import CONFIG from './config.js'
import CreateGame, { CreateGameError } from './commands/create-game.js'
import {
  ReadDiscordCommandOptionFromData,
  ReadPlayerIdFromContext,
} from './utils/discord.js'
import JoinGame, { JoinGameError } from './commands/join-game.js'
import SettingsPollSelectionMade from './commands/settings-poll-selection.js'
import GenericErrorHandler from './utils/error-handler.js'
import WinnerSelection from './commands/winner-selection.js'

async function handleCreateGameCommand(req, res) {
  const { data } = req.body
  const creatorId = ReadPlayerIdFromContext(req.body)
  const playerCount = ReadDiscordCommandOptionFromData(data, 'player_count')
  const eloRequirement = ReadDiscordCommandOptionFromData(
    data,
    'elo_requirement'
  )
  const voiceChat = ReadDiscordCommandOptionFromData(data, 'voice_chat')

  try {
    const game = await CreateGame(
      creatorId,
      playerCount,
      eloRequirement,
      voiceChat
    )

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Game created successfully! Game ID: ${game.gameThreadId}`,
      },
    })
  } catch (error) {
    if (error instanceof CreateGameError) {
      console.error('Error creating game:', error)
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: error.message,
        },
      })
    } else {
      throw error // Re-throw unexpected errors
    }
  }
}

async function handleJoinGameButton(req, res, customId) {
  // Extract playerId from context
  const playerId = ReadPlayerIdFromContext(req.body)
  // Extract game ID from custom_id
  const gameId = customId.split('_')[2]

  // Call the JoinGame function with playerId and game
  try {
    return JoinGame(playerId, gameId).then(() =>
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: `You have joined the game: <#${gameId}>.`,
        },
      })
    )
  } catch (error) {
    if (error instanceof JoinGameError) {
      console.error(`JoinGameError: ${error.message}`)

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: error.message,
        },
      })
    } else {
      throw error // Re-throw unexpected errors
    }
  }
}

async function handleSettingsPollSelection(req, res, customId) {
  const { data } = req.body
  // Handle settings poll interaction
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(req.body)
  const selectedSettingId = data.values[0]

  const voteCounted = await SettingsPollSelectionMade(
    threadId,
    playerId,
    selectedSettingId
  )

  if (voteCounted) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `You have selected settings #${selectedSettingId} for the game.`,
      },
    })
  } else {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Settings have already been finalized for this game. No further votes can be cast.`,
      },
    })
  }
}

async function handleWinnerPollSelection(req, res, customId) {
  const { data } = req.body
  // Handle settings poll interaction
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(req.body)
  const winnerId = data.values[0]

  const selectionAccepted = await WinnerSelection(threadId, playerId, winnerId)

  if (selectionAccepted) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Your selection of <@${winnerId}> as winner has been counted`
      }
    })
  } else {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: `Your selection of <@${winnerId}> as winner could not be counted.  Please try again.`
      }
    })
  }
}

export default async function CreateApp() {
  // Create an express app
  const app = express()

  app.use(GenericErrorHandler) // Use the generic error handler
  app.use(express.json()) // Parse JSON bodies
  app.use(verifyKeyMiddleware(CONFIG.publicKey)) // Verify Discord requests

  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   * Parse request body and verifies incoming requests using discord-interactions package
   */
  app.post('/interactions', async function (req, res) {
    // Interaction id, type and data
    const { id, type, data } = req.body

    /**
     * Handle verification requests
     */
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionResponseType.PONG })
    }

    /**
     * Handle slash command requests
     * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
     */
    if (type === InteractionType.APPLICATION_COMMAND) {
      const { name } = data

      if (name == 'create_game' && id) {
        return await handleCreateGameCommand(req, res)
      }

      console.error(`unknown command: ${name}`)
      return res.status(400).json({ error: 'unknown command' })
    }

    /**
     * Handle component interactions (buttons, select menus, etc.)
     * See https://discord.com/developers/docs/interactions/message-components
     */
    if (type == InteractionType.MESSAGE_COMPONENT) {
      const { custom_id } = data
      console.log(`Custom ID: ${custom_id}`)

      if (custom_id.startsWith('join_game_')) {
        return await handleJoinGameButton(req, res, custom_id)
      } else if (custom_id.startsWith('settings_poll_')) {
        return await handleSettingsPollSelection(req, res, custom_id)
      } else if (custom_id.startsWith('winner_selection_')) {
        return await handleWinnerPollSelection(req, res, custom_id)
      }

      console.error(`unknown component interaction: ${custom_id}`)
      return res.status(400).json({ error: 'unknown component interaction' })
    }

    console.error('unknown interaction type', type)
    return res.status(400).json({ error: 'unknown interaction type' })
  })

  return app
}
