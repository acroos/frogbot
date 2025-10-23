import { InteractionType, verifyKeyMiddleware } from 'discord-interactions'
import express, { Request, Response, Express } from 'express'
import cron from 'node-cron'
import CreateGame, { CreateGameError } from './commands/create-game.ts'
import FinishGame from './commands/finish-game.ts'
import JoinGame, { JoinGameError } from './commands/join-game.ts'
import LeaveGame, { LeaveGameError } from './commands/leave-game.ts'
import SettingsPollSelectionMade from './commands/settings-poll-selection.ts'
import WinnerSelection from './commands/winner-selection.ts'
import CONFIG from './config.ts'
import { VOTE_VALUES } from './constants.ts'
import {
  ReadDiscordCommandOptionFromData,
  ReadGuildIdFromContext,
  ReadPlayerIdFromContext,
} from './utils/discord.ts'
import {
  sendEphemeralSuccess,
  sendEphemeralError,
  sendPong,
} from './utils/responses.ts'
import {
  CleanUpFinalizedGames,
  CleanUpOldGames,
  CloseSettingsSelection,
  FinalizeGames,
} from './utils/utils.ts'

interface DiscordInteractionData {
  name?: string
  custom_id?: string
  values?: string[]
  options?: Array<{
    name: string
    value: string | number | boolean
  }>
}

interface DiscordInteractionBody {
  id?: string
  type: number
  data: DiscordInteractionData
  guild_id?: string
  channel_id?: string
  member?: {
    user?: {
      id: string
    }
  }
  user?: {
    id: string
  }
}

interface DiscordRequest extends Request {
  body: DiscordInteractionBody
}

async function handleCreateGameCommand(
  req: DiscordRequest,
  res: Response
): Promise<unknown> {
  const { data } = req.body
  const guildId = ReadGuildIdFromContext(req.body)
  const creatorId = ReadPlayerIdFromContext(req.body)
  const playerCount = ReadDiscordCommandOptionFromData<number>(
    data,
    'player_count'
  )
  const eloRequirement = ReadDiscordCommandOptionFromData<number>(
    data,
    'elo_requirement'
  )

  try {
    const game = await CreateGame(
      guildId,
      creatorId,
      playerCount,
      eloRequirement
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

async function handleJoinGameButton(
  req: DiscordRequest,
  res: Response,
  customId: string
): Promise<unknown> {
  const guildId = ReadGuildIdFromContext(req.body)
  const playerId = ReadPlayerIdFromContext(req.body)
  const gameId = customId.split('_')[2]

  if (!gameId) {
    return sendEphemeralError(res, 'Invalid game ID')
  }

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

async function handleLeaveGameButton(
  req: DiscordRequest,
  res: Response,
  customId: string
): Promise<unknown> {
  const guildId = ReadGuildIdFromContext(req.body)
  const playerId = ReadPlayerIdFromContext(req.body)
  const gameId = customId.split('_')[2]

  if (!gameId) {
    return sendEphemeralError(res, 'Invalid game ID')
  }

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

async function handleSettingsPollSelection(
  req: DiscordRequest,
  res: Response,
  customId: string
): Promise<unknown> {
  const { data } = req.body
  // Handle settings poll interaction
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(req.body)
  const selectedSettingId = data.values?.[0]

  if (!threadId) {
    return sendEphemeralError(res, 'Invalid thread ID')
  }

  if (!selectedSettingId) {
    return sendEphemeralError(res, 'No setting selected')
  }

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

async function handleWinnerPollSelection(
  req: DiscordRequest,
  res: Response,
  customId: string
): Promise<unknown> {
  const { data } = req.body
  // Handle settings poll interaction
  const threadId = customId.split('_')[2]
  const playerId = ReadPlayerIdFromContext(req.body)
  const winnerId = data.values?.[0]

  if (!threadId) {
    return sendEphemeralError(res, 'Invalid thread ID')
  }

  if (!winnerId) {
    return sendEphemeralError(res, 'No winner selected')
  }

  const selectionAccepted = await WinnerSelection(threadId, playerId, winnerId)

  if (selectionAccepted) {
    const responseContent =
      winnerId === VOTE_VALUES.NOT_PLAYED
        ? 'Your vote that the game was not played has been counted'
        : `Your selection of <@${winnerId}> as winner has been counted`

    return sendEphemeralSuccess(res, responseContent)
  } else {
    const errorContent =
      winnerId === VOTE_VALUES.NOT_PLAYED
        ? 'Your vote that the game was not played could not be counted. Please try again.'
        : `Your selection of <@${winnerId}> as winner could not be counted.  Please try again.`

    return sendEphemeralError(res, errorContent)
  }
}

async function handleFinishGameButton(
  _req: DiscordRequest,
  res: Response,
  customId: string
): Promise<unknown> {
  const gameId = customId.split('_')[2]

  if (!gameId) {
    return sendEphemeralError(res, 'Invalid game ID')
  }

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

export default async function CreateApp(): Promise<Express> {
  cron.schedule('*/2 * * * *', async () => {
    try {
      await Promise.all([FinalizeGames(), CloseSettingsSelection()])
    } catch (error) {
      console.error('Error in finalize/settings cron job:', error)
    }
  })

  cron.schedule('*/10 * * * *', async () => {
    try {
      await Promise.all([CleanUpFinalizedGames(), CleanUpOldGames()])
    } catch (error) {
      console.error('Error in cleanup cron job:', error)
    }
  })

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
    async function (req: Request, res: Response) {
      const discordReq = req as DiscordRequest
      // Interaction id, type and data
      const { id, type, data } = discordReq.body

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
          return await handleCreateGameCommand(discordReq, res)
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
        if (!custom_id) {
          console.error('missing custom_id in component interaction')
          return res
            .status(400)
            .json({ error: 'missing custom_id in component interaction' })
        }

        if (custom_id.startsWith('join_game_')) {
          return await handleJoinGameButton(discordReq, res, custom_id)
        } else if (custom_id.startsWith('settings_poll_')) {
          return await handleSettingsPollSelection(discordReq, res, custom_id)
        } else if (custom_id.startsWith('winner_selection_')) {
          return await handleWinnerPollSelection(discordReq, res, custom_id)
        } else if (custom_id.startsWith('leave_game_')) {
          return await handleLeaveGameButton(discordReq, res, custom_id)
        } else if (custom_id.startsWith('finish_game_')) {
          return await handleFinishGameButton(discordReq, res, custom_id)
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
