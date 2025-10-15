import CONFIG from '../config.js'

export async function FetchPlayerInfo(playerId) {
  const response = await FriendsOfRiskRequest(`getuser`, {
    method: 'POST',
    body: { discordid: playerId },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch player info: ${response.statusText}`)
  }
  const data = await response.json()

  return data.data
}

export async function FriendsOfRiskRequest(endpoint, options) {
  try {
    // append endpoint to root API URL
    const url = `${CONFIG.friendsOfRiskApiBaseUrl}/${endpoint}`
    // Stringify payloads
    if (options.body) options.body = JSON.stringify(options.body)

    // Use fetch to make requests
    const request = {
      headers: {
        'X-API-KEY': CONFIG.friendsOfRiskApiKey,
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'FrogBot (https://github.com/acroos/frogbot, 1.0.0)',
      },
      ...options,
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
