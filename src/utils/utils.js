import { MessageComponentTypes } from 'discord-interactions'
import {
  CloseThread,
  LockThread,
  SendMessageWithComponents,
} from './discord.js'
import { FetchPlayerInfo } from './friends-of-risk.js'
import {
  GetFinalizedGames,
  RemoveGame,
  MapToAllGames,
  SetFinalizedGames,
  SetGame,
  GetGame,
  RemoveAllPlayersInGame,
} from './redis.js'

const THREAD_OPEN_TIME = 180000 // 3 minutes in ms
const SETTINGS_SELECTION_TIME = 300000 // 5 minutes in ms
const OLD_GAME_THRESHOLD = 14400000 // 4 hours in ms

export function FinalizeGames() {
  const startTime = Date.now()

  const finalizedGames = []
  MapToAllGames(async (game) => {
    if (gameShouldFinalize(startTime, game.completedAt)) {
      const response = await LockThread(game.gameThreadId)
      if (!response.ok) {
        console.log(`Could not lock game thread: ${game.gameThreadId}`)
      }
      finalizedGames.push(game.gameThreadId)
    }
  })
    .then(async () => {
      await SetFinalizedGames(finalizedGames)
      console.log('Finalized games!')
    })
    .catch((error) => {
      console.error('Error finalizing games: ', error)
    })
}

export function CleanUpFinalizedGames() {
  console.log(`Starting finalized game cleanup at ${new Date().toUTCString()}`)
  GetFinalizedGames()
    .then((gameIds) => {
      if (!gameIds) {
        return
      }

      for (let gameId of gameIds) {
        CloseThread(gameId)
          .then(async () => {
            await RemoveGame(gameId)
          })
          .catch((error) => {
            console.error('Error cleaning up finalized games: ', error)
          })
      }
    })
    .then(() =>
      console.log(
        `Finished finalized game cleanup at ${new Date().toUTCString()}`
      )
    )
}

export function CleanUpOldGames() {
  const startTime = Date.now()
  console.log(`Starting old game cleanup at ${new Date().toUTCString()}`)

  MapToAllGames(async (game) => {
    if (startTime - game.createdAt > OLD_GAME_THRESHOLD) {
      CloseThread(game.gameThreadId)
        .then(async () => {
          await RemoveGame(game.gameThreadId)
          await RemoveAllPlayersInGame(game.gameThreadId)
        })
        .catch((error) => {
          console.error('Error cleaning up finalized games: ', error)
        })
    }
  }).then(() =>
    console.log(`Finished old game cleanup at ${new Date().toUTCString()}`)
  )
}

export function CloseSettingsSelection() {
  const startTime = Date.now()
  MapToAllGames(async (game) => {
    if (game.filledAt && startTime - game.filledAt > SETTINGS_SELECTION_TIME) {
      const votes = Object.values(game.settingsVotes)
      const selectedSettings =
        votes.length > 0
          ? votes[Math.floor(Math.random() * votes.length)]
          : game.settingsOptions[
              Math.floor(Math.random() * game.settingsOptions.length)
            ]

      game.selectedSettingId = selectedSettings.settingid
      return await Promise.all([
        sendStartGameMessage(game, selectedSettings),
        SetGame(gameId, game),
      ])
    }
  })
}

function gameShouldFinalize(startTime, completionTime) {
  if (!completionTime) {
    return false
  }

  return startTime - completionTime > THREAD_OPEN_TIME
}

async function sendStartGameMessage(game, selectedSettings) {
  const gameId = game.gameThreadId
  const players = await Promise.all(
    game.players.map((playerId) => FetchPlayerInfo(playerId))
  )

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `${game.players.map((playerId) => `<@${playerId}>`)}\nSettings have been finalized for the game!`,
    },
    {
      type: MessageComponentTypes.MEDIA_GALLERY,
      items: [
        {
          media: {
            url: selectedSettings.link,
          },
          description: `${selectedSettings.map} ${selectedSettings.cards} ${selectedSettings.gametype} [#${selectedSettings.settingid}]`,
        },
      ],
    },
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content:
        'When the game is complete, please select a winner from the selection below',
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      placeholder: 'Select a winner',
      components: [
        {
          type: MessageComponentTypes.STRING_SELECT,
          custom_id: `winner_selection_${gameId}`,
          options: players.map((player) => ({
            label: player.name,
            value: player.discordid,
          })),
        },
      ],
    },
  ]

  return await SendMessageWithComponents(gameId, components)
}
