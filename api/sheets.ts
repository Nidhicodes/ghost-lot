import { lookupDeps } from '../src/server/deps'
import { handler } from '../src/server/http'
import { findSheets, SheetsQuery } from '../src/server/lookup'

export default handler(async (req, res) => {
  const { lat, lon, r } = SheetsQuery.parse(req.query)
  const result = await findSheets([lon, lat], r, await lookupDeps())
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.status(200).json(result)
})
