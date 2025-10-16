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
import { VOTE_VALUES } from './constants.js'
import {
  ReadDiscordCommandOptionFromData,
  ReadGuildIdFromContext,
  ReadPlayerIdFromContext,
} from './utils/discord.js'
import {
  sendEphemeralSuccess,
  sendEphemeralError,
  sendPong,
} from './utils/responses.js'
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

    return sendEphemeralSuccess(
      res,
      `Game created successfully! Game ID: ${game.gameThreadId}`
    )
  } catch (error) {
    if (error instanceof CreateGameError) {
      console.error('Error creating game:', error)
      return sendEphemeralError(res, error.message)
    } else {
      throw error // Re-throw unexpected errors
    }
  }
}

async function handleJoinGameButton(req, res, customId) {
  const guildId = ReadGuildIdFromContext(req.body)
  const playerId = ReadPlayerIdFromContext(req.body)
  const gameId = customId.split('_')[2]

  try {
    await JoinGame(guildId, playerId, gameId)
    
    return sendEphemeralSuccess(res, `You have joined the game: <#${gameId}>.`)
  } catch (error) {
    if (error instanceof JoinGameError) {
      console.error(`JoinGameError: ${error.message}`)
      return sendEphemeralError(res, error.message)
    } else {
      throw error // Re-throw unexpected errors
    }
  }
}

async function handleLeaveGameButton(req, res, customId) {
  const guildId = ReadGuildIdFromContext(req.body)
  const playerId = ReadPlayerIdFromContext(req.body)
  const gameId = customId.split('_')[2]

  try {
    await LeaveGame(guildId, playerId, gameId)
    
    return sendEphemeralSuccess(res, `You have left the game: ${gameId}.`)
  } catch (error) {
    if (error instanceof LeaveGameError) {
      console.error(`LeaveGameError: ${error.message}`)
      return sendEphemeralError(res, error.message)
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
    return sendEphemeralSuccess(
      res,
      `You have selected settings #${selectedSettingId} for the game.`
    )
  } else {
    return sendEphemeralError(
      res,
      `Settings have already been finalized for this game. No further votes can be cast.`
    )
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
    const responseContent = winnerId === VOTE_VALUES.NOT_PLAYED
      ? 'Your vote that the game was not played has been counted'
      : `Your selection of <@${winnerId}> as winner has been counted`

    return sendEphemeralSuccess(res, responseContent)
  } else {
    const errorContent = winnerId === VOTE_VALUES.NOT_PLAYED
      ? 'Your vote that the game was not played could not be counted. Please try again.'
      : `Your selection of <@${winnerId}> as winner could not be counted.  Please try again.`

    return sendEphemeralError(res, errorContent)
  }
}

async function handleFinishGameButton(req, res, customId) {
  const gameId = customId.split('_')[2]

  try {
    const result = await FinishGame(gameId)
    
    if (result) {
      return sendEphemeralSuccess(res, `Game <#${gameId}> has been finished`)
    } else {
      return sendEphemeralError(res, `Game <#${gameId}> is already finished`)
    }
  } catch (error) {
    console.error(`Error finishing game ${gameId}:`, error)
    throw error
  }
}

export default async function CreateApp() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      await Promise.all([
        FinalizeGames(),
        CloseSettingsSelection()
      ])
    } catch (error) {
      console.error('Error in finalize/settings cron job:', error)
    }
  })

  cron.schedule('*/10 * * * *', async () => {
    try {
      await Promise.all([
        CleanUpFinalizedGames(),
        CleanUpOldGames()
      ])
    } catch (error) {
      console.error('Error in cleanup cron job:', error)
    }
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
        return sendPong(res)
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
