import { MessageComponentTypes } from 'discord-interactions'
import {
  CloseThread,
  LockThread,
  SendMessageWithComponents,
} from './discord.js'
import { TIMING } from '../constants.js'
import {
  GetFinalizedGames,
  MapToAllGames,
  RemoveAllPlayersInGame,
  RemoveGame,
  SetFinalizedGames,
  SetGame,
} from './redis.js'

/**
 * Finalizes completed games by locking their threads
 * Runs periodically via cron job
 * @returns {Promise<void>}
 */
export function FinalizeGames() {
  const startTime = Date.now()

  const finalizedGames = []
  MapToAllGames(async (game) => {
    if (gameShouldFinalize(startTime, game.completedAt)) {
      const response = await LockThread(game.gameThreadId)
      if (!response.ok) {
        console.error(`Could not lock game thread: ${game.gameThreadId}`)
      }
      finalizedGames.push(game.gameThreadId)
    }
  })
    .then(async () => {
      await SetFinalizedGames(finalizedGames)
    })
    .catch((error) => {
      console.error('Error finalizing games: ', error)
    })
}

/**
 * Cleans up finalized games by closing threads and removing from Redis
 * Runs periodically via cron job
 * @returns {Promise<void>}
 */
export function CleanUpFinalizedGames() {
  console.log(`Starting finalized game cleanup at ${new Date().toUTCString()}`)
  GetFinalizedGames().then((gameIds) => {
    if (!gameIds) {
      return
    }

    for (let gameId of gameIds) {
      CloseThread(gameId)
        .then(async () => {
          await RemoveGame(gameId)
          await RemoveAllPlayersInGame(gameId)
        })
        .catch((error) => {
          console.error('Error cleaning up finalized games: ', error)
        })
    }
  })
}

/**
 * Cleans up old games that exceed the OLD_GAME_THRESHOLD
 * Runs periodically via cron job
 * @returns {Promise<void>}
 */
export function CleanUpOldGames() {
  const startTime = Date.now()
  MapToAllGames(async (game) => {
    if (startTime - game.createdAt > TIMING.OLD_GAME_THRESHOLD) {
      CloseThread(game.gameThreadId)
        .then(async () => {
          await RemoveAllPlayersInGame(game.gameThreadId).then(async () => {
            await RemoveGame(game.gameThreadId)
          })
        })
        .catch((error) => {
          console.error('Error cleaning up old games: ', error)
        })
    }
  })
}

/**
 * Closes settings selection for filled games after the selection time has elapsed
 * Randomly selects settings if not enough votes
 * Runs periodically via cron job
 * @returns {Promise<void>}
 */
export function CloseSettingsSelection() {
  const startTime = Date.now()
  MapToAllGames(async (game) => {
    // Settings have already been selected
    if (game.selectedSettingId) {
      return
    }
    // Game has not been filled
    if (!game.filledAt) {
      return
    }
    // Not enough time has passed
    if (startTime - game.filledAt < TIMING.SETTINGS_SELECTION_TIME) {
      return
    }
    console.log(`Closing settings selection for game: ${game.gameThreadId}`)

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
      SetGame(game.gameThreadId, game),
    ])
  })
}

/**
 * Gets 3 randomized settings for the specified player count
 * @param {number} playerCount - Number of players (4, 5, or 6)
 * @returns {Array<Object>} Array of 3 random setting objects
 * @throws {Error} If player count is invalid
 */
export function GetRandomizedSettings(playerCount) {
  const settingsForPlayerCount = SETTINGS_BY_PLAYER_COUNT[playerCount]
  if (!settingsForPlayerCount) {
    throw new Error(`Invalid player count: ${playerCount}`)
  }

  // Choose 3 random settings from the list
  const selectedSettings = []
  while (selectedSettings.length < 3) {
    const randomIndex = Math.floor(
      Math.random() * settingsForPlayerCount.length
    )
    selectedSettings.push(settingsForPlayerCount.splice(randomIndex, 1)[0])
  }

  return selectedSettings
}

function gameShouldFinalize(startTime, completionTime) {
  if (!completionTime) {
    return false
  }

  return startTime - completionTime > TIMING.THREAD_OPEN_TIME
}

/**
 * Sends the game start message with finalized settings and finish button
 * @param {Object} game - The game object
 * @param {Object} selectedSettings - The selected settings
 * @returns {Promise<Object>} The sent message response
 */
export async function sendStartGameMessage(game, selectedSettings) {
  const { ButtonStyleTypes } = await import('discord-interactions')

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
      content: 'When the game is complete, please click the button below',
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `finish_game_${game.gameThreadId}`,
          label: 'Finish Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    },
  ]

  return await SendMessageWithComponents(game.gameThreadId, components)
}

const SETTINGS_BY_PLAYER_COUNT = {
  4: [
    {
      settingid: '8268',
      map: 'Arrakis',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8268.png',
    },
    {
      settingid: '8269',
      map: 'Jules Vernes Mysterious Island',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8269.png',
    },

    {
      settingid: '8270',
      map: 'Dracon Fortress',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8270.png',
    },
    {
      settingid: '8271',
      map: 'SMG Spaceport',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8271.png',
    },
    {
      settingid: '8272',
      map: 'Europe',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8272.png',
    },
    {
      settingid: '8273',
      map: 'Arrakeen',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8273.png',
    },
    {
      settingid: '8352',
      map: 'United States',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8352.png',
    },
  ],
  5: [
    {
      settingid: '8261',
      map: 'Japan',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8261.png',
    },
    {
      settingid: '8262',
      map: 'Redacted',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8262.png',
    },
    {
      settingid: '8163',
      map: 'Africa Advanced',
      gametype: 'zombies',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8163.png',
    },
    {
      settingid: '8274',
      map: 'Las Vegas',
      gametype: 'zombies',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8274.png',
    },
    {
      settingid: '8275',
      map: 'Africa',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8275.png',
    },
    {
      settingid: '8276',
      map: 'Deutschland',
      gametype: 'zombies',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8276.png',
    },
    {
      settingid: '7984',
      map: '28 Turns Later',
      gametype: 'zombies',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/7984.png',
    },
    {
      settingid: '8277',
      map: 'Greece',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8277.png',
    },
    {
      settingid: '8278',
      map: 'The Younger Scrolls',
      gametype: 'caps 70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8278.png',
    },
  ],
  6: [
    {
      settingid: '8263',
      map: 'Britannia Advanced',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8263.png',
    },
    {
      settingid: '8264',
      map: 'Canada Advanced',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8264.png',
    },
    {
      settingid: '8265',
      map: 'Pangaea',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8265.png',
    },
    {
      settingid: '8266',
      map: 'Mira HQ',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8266.png',
    },
    {
      settingid: '8279',
      map: 'Brazil Advanced',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8279.png',
    },
    {
      settingid: '8280',
      map: 'Operation ADAM',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8280.png',
    },
    {
      settingid: '8281',
      map: 'Turkey',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8281.png',
    },
    {
      settingid: '8282',
      map: 'Turkey',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8282.png',
    },
    {
      settingid: '8283',
      map: 'Deutschland',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8283.png',
    },
    {
      settingid: '8284',
      map: 'Central America',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8284.png',
    },
    {
      settingid: '8285',
      map: 'Las Vegas',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8285.png',
    },
    {
      settingid: '8286',
      map: 'Mont St Michel',
      gametype: '70',
      cards: 'fixed',
      link: 'https://friendsofrisk.com/setting/8286.png',
    },
    {
      settingid: '8287',
      map: 'Africa Advanced',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8287.png',
    },
    {
      settingid: '8292',
      map: 'US Midwest',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8292.png',
    },
    {
      settingid: '8293',
      map: 'River Town Advanced',
      gametype: '70',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8293.png',
    },
    {
      settingid: '8294',
      map: 'US West',
      gametype: 'WD',
      cards: 'prog',
      link: 'https://friendsofrisk.com/setting/8294.png',
    },
  ],
}
