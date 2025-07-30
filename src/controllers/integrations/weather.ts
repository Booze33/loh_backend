import { Context } from 'hono'

export const getWeatherForecast = async (c: Context) => {
  try {
    const location = c.req.query('location')
    const days = c.req.query('days') || '3'

    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${location}&days=${days}`
    )

    const data = await response.json()

    return c.json({
      location: data.location,
      forecast: data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        maxTemp: day.day.maxtemp_c,
        minTemp: day.day.mintemp_c,
        condition: day.day.condition.text
      }))
    })
  } catch (error) {
    console.error('Weather error:', error)
    return c.json({ error: 'Failed to fetch weather data' }, 500)
  }
}