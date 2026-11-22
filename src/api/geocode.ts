import { z } from 'zod'
import { AddressQuery, geocodeAddress } from '../server/geocode'
import { handler } from '../server/http'

const Query = z.object({ q: AddressQuery })

export default handler(async (req, res) => {
  const { q } = Query.parse(req.query)
  const result = await geocodeAddress(q)
  if (!result) {
    res.status(404).json({ error: 'No match for that address. Check the spelling and include the city and state.' })
    return
  }
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.status(200).json(result)
})
