import {
  FinalizeGames,
  CloseSettingsSelection,
} from '../../../../src/utils/utils.js'

// This route handles the 2-minute cron job for finalizing games and closing settings
export async function GET(request) {
  // Verify the request is from Vercel Cron (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await FinalizeGames()
    await CloseSettingsSelection()
    
    return Response.json({
      success: true,
      message: 'Finalize games and close settings completed',
    })
  } catch (error) {
    console.error('Error in finalize cron:', error)
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
