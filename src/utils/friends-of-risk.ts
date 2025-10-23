import CONFIG from '../config.ts'
import type {
  FriendsOfRiskPlayerInfo,
  FriendsOfRiskRequestOptions,
} from '../types/friends-of-risk.ts'

/**
 * Fetches player information from Friends of Risk API
 * @param playerId - The Discord user ID of the player
 * @returns Player information including profile and ELO
 * @throws Error if the API request fails
 */
export async function FetchPlayerInfo(
  playerId: string
): Promise<FriendsOfRiskPlayerInfo> {
  const response = await FriendsOfRiskRequest(`getuser`, {
    method: 'POST',
    body: { discordid: playerId },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch player info: ${response.statusText}`)
  }
  const data = (await response.json()) as { data: FriendsOfRiskPlayerInfo }

  return data.data
}

/**
 * Makes an HTTP request to the Friends of Risk API
 * @param endpoint - The API endpoint to call (without base URL)
 * @param options - Request options including method and body
 * @returns The fetch Response object
 * @throws Error if the request fails
 */
export async function FriendsOfRiskRequest(
  endpoint: string,
  options: FriendsOfRiskRequestOptions
): Promise<Response> {
  try {
    // append endpoint to root API URL
    const url = `${CONFIG.friendsOfRiskApiBaseUrl}/${endpoint}`

    // Stringify payloads
    const requestOptions = {
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }

    // Use fetch to make requests
    const request: RequestInit = {
      headers: {
        'X-API-KEY': CONFIG.friendsOfRiskApiKey,
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'FrogBot (https://github.com/acroos/frogbot, 1.0.0)',
      },
      ...requestOptions,
    }
    const res = await fetch(url, request)
    // throw API errors
    if (!res.ok) {
      const data = await res.json()
      console.log(`Failed to fetch from FoR: ${JSON.stringify(data)}`)
      throw new Error(JSON.stringify(data))
    }
    // return original response
    return res
  } catch (err) {
    console.error('Error making request to FoR:', err)
    throw err
  }
}
