import {
  CleanUpFinalizedGames,
  CleanUpOldGames,
} from '../../../../src/utils/utils.js'

// This route handles the 10-minute cron job for cleanup tasks
export async function GET(request) {
  // Verify the request is from Vercel Cron (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await CleanUpFinalizedGames()
    await CleanUpOldGames()
    
    return Response.json({
      success: true,
      message: 'Cleanup tasks completed',
    })
  } catch (error) {
    console.error('Error in cleanup cron:', error)
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
