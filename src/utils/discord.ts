import { InteractionResponseFlags } from 'discord-interactions'
import CONFIG from '../config.ts'

interface DiscordRequestOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | Array<Record<string, unknown>>
}

/* Discord API functions */
export async function DiscordRequest(
  endpoint: string,
  options: DiscordRequestOptions
): Promise<Response> {
  // append endpoint to root API URL
  const url = `https://discord.com/api/v10/${endpoint}`
  // Stringify payloads
  let body: string | undefined
  if (options.body) {
    body = JSON.stringify(options.body)
  }
  // Use fetch to make requests
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${CONFIG.discordToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'User-Agent': 'FrogBot (https://github.com/acroos/frogbot, 1.0.0)',
    },
    ...options,
    body,
  })
  // throw API errors
  if (!res.ok) {
    const data = await res.json()
    throw new Error(JSON.stringify(data))
  }
  // return original response
  return res
}

export async function InstallGlobalCommands(
  commands: Array<Record<string, unknown>>
): Promise<void> {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${CONFIG.appId}/commands`

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    await DiscordRequest(endpoint, { method: 'PUT', body: commands })
  } catch (err) {
    console.error(err)
  }
}

export async function SendMessageWithContent(
  channelId: string,
  content: string
): Promise<unknown> {
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

export async function SendMessageWithComponents(
  channelId: string,
  components: Array<Record<string, unknown>>
): Promise<unknown> {
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
  channelId: string,
  messageId: string,
  components: Array<Record<string, unknown>>
): Promise<unknown> {
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

export async function RemoveMessage(
  channelId: string,
  messageId: string
): Promise<Response> {
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

export async function AddPlayerToThread(
  threadId: string,
  playerId: string
): Promise<Response> {
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

export async function RemovePlayerFromThread(
  threadId: string,
  playerId: string
): Promise<Response> {
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

export async function LockThread(threadId: string): Promise<Response> {
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

export async function CloseThread(threadId: string): Promise<Response> {
  const result = await DiscordRequest(`channels/${threadId}`, {
    method: 'DELETE',
  })

  if (!result.ok) {
    throw new Error(`Failed to close thread: ${result.statusText}`)
  }

  return result
}

/* Discord helpers */
export function ReadDiscordCommandOptionFromData<T = unknown>(
  data: { options?: Array<{ name: string; value: unknown }> },
  name: string,
  defaultValue: T | null = null
): T | null {
  // Find the option in the data
  const option = data.options?.find((opt) => opt.name === name)

  // If the option is not found, log info and return the default value
  if (!option) {
    console.info(`Option "${name}" not found in command data.`)
    return defaultValue
  }

  // If the option is found, return its value
  return option.value as T
}

export function ReadPlayerIdFromContext(body: {
  context?: number
  member?: {
    user?: {
      id: string
    }
  }
  user?: {
    id: string
  }
}): string {
  // If context is 0, return the member's user ID
  if (body.context === 0) {
    return body.member?.user?.id || ''
  }
  // Otherwise, return the user ID directly
  return body.user?.id || ''
}

export function ReadGuildIdFromContext(body: { guild_id?: string }): string {
  return body.guild_id || ''
}
