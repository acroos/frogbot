import { InteractionResponseFlags } from 'discord-interactions'
import CONFIG from '../config.js'

/* Discord API functions */
export async function DiscordRequest(endpoint, options) {
  // append endpoint to root API URL
  const url = `https://discord.com/api/v10/${endpoint}`
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body)
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${CONFIG.discordToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'FrogBot (https://github.com/acroos/frogbot, 1.0.0)',
    },
    ...options,
  })
  // throw API errors
  if (!res.ok) {
    const data = await res.json()
    throw new Error(JSON.stringify(data))
  }
  // return original response
  return res
}

export async function InstallGlobalCommands(commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${CONFIG.appId}/commands`

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands })
  } catch (err) {
    console.error(err)
  }
}

export async function SendMessageWithContent(channelId, content) {
  const result = await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      content: content,
    },
  })
  if (!result.ok) {
    throw new Error(`Failed to send message: ${result.statusText}`)
  }

  const json = await result.json()
  console.log(`Message send response: ${JSON.stringify(json)}`)
  return json
}

export async function SendMessageWithComponents(channelId, components) {
  const result = await DiscordRequest(`channels/${channelId}/messages`, {
    method: 'POST',
    body: {
      flags: InteractionResponseFlags.IS_COMPONENTS_V2,
      components: components,
    },
  })
  if (!result.ok) {
    throw new Error(
      `Failed to send message with components: ${result.statusText}`
    )
  }

  const json = await result.json()
  console.log(`Message send response: ${JSON.stringify(json)}`)
  return json
}

export async function UpdateMessageWithComponents(
  channelId,
  messageId,
  components
) {
  const result = await DiscordRequest(
    `channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      body: {
        components: components,
      },
    }
  )

  if (!result.ok) {
    throw new Error(`Failed to send message: ${result.statusText}`)
  }

  const json = await result.json()
  console.log(`Message update response: ${JSON.stringify(json)}`)
  return json
}

export async function RemoveMessage(channelId, messageId) {
  const result = await DiscordRequest(
    `channels/${channelId}/messages/${messageId}`,
    {
      method: 'DELETE',
    }
  )
  if (!result.ok) {
    throw new Error(`Failed to remove message: ${result.statusText}`)
  }

  return result
}

export async function AddPlayerToThread(threadId, playerId) {
  const result = await DiscordRequest(
    `channels/${threadId}/thread-members/${playerId}`,
    {
      method: 'PUT',
    }
  )
  if (!result.ok) {
    throw new Error(`Failed to add player to thread: ${result.statusText}`)
  }

  return result
}

export async function RemovePlayerFromThread(threadId, playerId) {
  const result = await DiscordRequest(
    `channels/${threadId}/thread-members/${playerId}`,
    {
      method: 'DELETE',
    }
  )
  if (!result.ok) {
    throw new Error(`Failed to remove player from thread: ${result.statusText}`)
  }

  return result
}

export async function LockThread(threadId) {
  const result = await DiscordRequest(`channels/${threadId}`, {
    method: 'PATCH',
    body: {
      locked: true,
    },
  })

  if (!result.ok) {
    throw new Error(`Failed to lock thread: ${result.statusText}`)
  }

  return result
}

export async function CloseThread(threadId) {
  const result = await DiscordRequest(`channels/${threadId}`, {
    method: 'PATCH',
    body: {
      archived: true,
    },
  })

  if (!result.ok) {
    throw new Error(`Failed to close thread: ${result.statusText}`)
  }

  return result
}

export async function CreateGameThread(name, loungeChannelId) {
  console.log(`Creating game thread in lounge channel: ${loungeChannelId}`)

  const result = await DiscordRequest(`channels/${loungeChannelId}/threads`, {
    method: 'POST',
    body: {
      name: name,
      type: 12, // Private thread
      invitable: false, // Players cannot invite others
    },
  })

  if (!result.ok) {
    throw new Error(`Failed to create game thread: ${result.statusText}`)
  }

  const newThreadJson = await result.json()
  return newThreadJson.id
}

/* Discord helpers */
export function ReadDiscordCommandOptionFromData(
  data,
  name,
  defaultValue = null
) {
  // Find the option in the data
  const option = data.options.find((opt) => opt.name === name)

  // If the option is not found, log info and return the default value
  if (!option) {
    console.info(`Option "${name}" not found in command data.`)
    return defaultValue
  }

  // If the option is found, return its value
  return option.value
}

export function ReadPlayerIdFromContext(body) {
  // If context is 0, return the member's user ID
  if (body.context === 0) {
    return body.member.user.id
  }
  // Otherwise, return the user ID directly
  return body.user.id
}

export function ReadGuildIdFromContext(body) {
  return body.guild_id
}

/**
 * Builds the components for a game ping message showing current status
 * @param {Object} game - The game object
 * @param {string} guildId - The guild ID (for role mention)
 * @param {boolean} isInitial - Whether this is the initial message (includes role ping)
 * @returns {Array} The message components
 */
export function BuildGamePingComponents(game, guildId, isInitial = false) {
  const {
    gameThreadId,
    creatorId,
    playerCount,
    eloRequirement,
    players = [],
  } = game
  const spotsRemaining = playerCount - players.length
  const isFull = spotsRemaining === 0

  const MessageComponentTypes = {
    TEXT_DISPLAY: 1,
    ACTION_ROW: 2,
    BUTTON: 3,
  }

  const ButtonStyleTypes = {
    PRIMARY: 1,
  }

  let content
  if (isFull) {
    content = `Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n\nGame has filled, keep an eye out for the next one or start your own with the \`/create_game\` command`
  } else {
    const rolePrefix = isInitial ? `<@&${CONFIG.loungeRoleId[guildId]}> ` : ''
    const statusText =
      players.length === 1
        ? `${spotsRemaining} spots remaining`
        : `${players.length}/${playerCount} players joined, ${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining`
    content = `${rolePrefix}Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n- Status: ${statusText}\n\nUse the button below to join the game!`
  }

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: content,
    },
  ]

  // Only add the button if game is not full
  if (!isFull) {
    components.push({
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `join_game_${gameThreadId}`,
          label: 'Join Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    })
  }

  return components
}
