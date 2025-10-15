import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions'
import express from 'express'
import cron from 'node-cron'
import CreateGame, { CreateGameError } from './commands/create-game.js'
import FinishGame from './commands/finish-game.js'
import JoinGame, { JoinGameError } from './commands/join-game.js'
import LeaveGame, { LeaveGameError } from './commands/leave-game.js'
import SettingsPollSelectionMade from './commands/settings-poll-selection.js'
import WinnerSelection from './commands/winner-selection.js'
import CONFIG from './config.js'
import {
  ReadDiscordCommandOptionFromData,
  ReadGuildIdFromContext,
  ReadPlayerIdFromContext,
} from './utils/discord.js'
import {
  CleanUpFinalizedGames,
  CleanUpOldGames,
  CloseSettingsSelection,
  FinalizeGames,
} from './utils/utils.js'

async function handleCreateGameCommand(req, res) {
  const { data } = req.body
  const guildId = ReadGuildIdFromContext(req.body)
  const creatorId = ReadPlayerIdFromContext(req.body)
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
  const guildId = ReadGuildIdFromContext(req.body)
  // Extract playerId from context
  const playerId = ReadPlayerIdFromContext(req.body)
  // Extract game ID from custom_id
  const gameId = customId.split('_')[2]

  // Call the JoinGame function with playerId and game
  return JoinGame(guildId, playerId, gameId)
    .then(() =>
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: `You have joined the game: <#${gameId}>.`,
        },
      })
    )
    .catch((error) => {
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
    })
}

async function handleLeaveGameButton(req, res, customId) {
  const guildId = ReadGuildIdFromContext(req.body)
  const playerId = ReadPlayerIdFromContext(req.body)
  const gameId = customId.split('_')[2]

  return LeaveGame(guildId, playerId, gameId)
    .then(() => {
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: `You have left the game: ${gameId}.`,
        },
      })
    })
    .catch((error) => {
      if (error instanceof LeaveGameError) {
        console.error(`LeaveGameError: ${error.message}`)

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
    })
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
    const responseContent = winnerId === 'not_played' 
      ? 'Your vote that the game was not played has been counted'
      : `Your selection of <@${winnerId}> as winner has been counted`

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: responseContent,
      },
    })
  } else {
    const errorContent = winnerId === 'not_played'
      ? 'Your vote that the game was not played could not be counted. Please try again.'
      : `Your selection of <@${winnerId}> as winner could not be counted.  Please try again.`

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL,
        content: errorContent,
      },
    })
  }
}

async function handleFinishGameButton(req, res, customId) {
  // Extract game ID from custom_id
  const gameId = customId.split('_')[2]

  return FinishGame(gameId).then((result) => {
    if (result) {
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: `Game <#${gameId}> has been finished`,
        },
      })
    } else {
      res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.EPHEMERAL,
          content: `Game <#${gameId}> is already finished`,
        },
      })
    }
  })
}

export default async function CreateApp() {
  cron.schedule('*/2 * * * *', () => {
    FinalizeGames()
    CloseSettingsSelection()
  })

  cron.schedule('*/10 * * * *', () => {
    CleanUpFinalizedGames()
    CleanUpOldGames()
  })

  // cron.schedule('0 * * * *', () => {
  //   CleanUpOldGames()
  // })

  // Create an express app
  const app = express()

  app.use(express.json()) // Parse JSON bodies

  app.get('/health', function (_req, res) {
    res.send('ok')
  })

  /**
   * Interactions endpoint URL where Discord will send HTTP requests
   * Parse request body and verifies incoming requests using discord-interactions package
   */
  app.post(
    '/interactions',
    verifyKeyMiddleware(CONFIG.publicKey),
    async function (req, res) {
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
        if (custom_id.startsWith('join_game_')) {
          return await handleJoinGameButton(req, res, custom_id)
        } else if (custom_id.startsWith('settings_poll_')) {
          return await handleSettingsPollSelection(req, res, custom_id)
        } else if (custom_id.startsWith('winner_selection_')) {
          return await handleWinnerPollSelection(req, res, custom_id)
        } else if (custom_id.startsWith('leave_game_')) {
          return await handleLeaveGameButton(req, res, custom_id)
        } else if (custom_id.startsWith('finish_game_')) {
          return await handleFinishGameButton(req, res, custom_id)
        }

        console.error(`unknown component interaction: ${custom_id}`)
        return res.status(400).json({ error: 'unknown component interaction' })
      }

      console.error('unknown interaction type', type)
      return res.status(400).json({ error: 'unknown interaction type' })
    }
  )

  return app
}
