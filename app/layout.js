export const metadata = {
  title: 'Frogbot',
  description: 'A Discord bot for doing frog stuff',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
