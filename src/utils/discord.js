import { InteractionResponseFlags } from 'discord-interactions'
import CONFIG from '../config.js'

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
      content: content
    },
  })
  if (!result.ok) {
    throw new Error(`Failed to send message: ${result.statusText}`)
  }
  return result
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
    throw new Error(`Failed to send message with components: ${result.statusText}`)
  }
  return result
}

export async function AddPlayerToThread(threadId, playerId) {
  const result = await DiscordRequest(`channels/${threadId}/thread-members/${playerId}`, {
    method: 'PUT',
  })
  if (!result.ok) {
    throw new Error(`Failed to add player to thread: ${result.statusText}`)
  }
  return result
}

export function ReadDiscordCommandOptionFromData(data, name, defaultValue = null) {
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
