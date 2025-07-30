import { Context } from 'hono'
import { Client } from '@notionhq/client'
import { prisma } from '../../utils/prisma.js'

export const searchNotionPages = async (c: Context) => {
  try {
    const user = c.get('user')
    const query = c.req.query('query')

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'notion' }
    })

    if (!token) return c.json({ error: 'Notion not connected' }, 401)

    const notionClient = new Client({ auth: token.accessToken })

    const response = await notionClient.search({
      query: query || '',
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    })

    return c.json({
      results: response.results.map(page => ({
        id: page.id,
        title: 'title' in page.properties ? 
          page.properties.title.title[0]?.plain_text : 'Untitled',
        url: page.url,
        lastEdited: page.last_edited_time
      }))
    })
  } catch (error) {
    console.error('Notion error:', error)
    return c.json({ error: 'Failed to search Notion' }, 500)
  }
}

export const createNotionPage = async (c: Context) => {
  try {
    const user = c.get('user')
    const { parentId, title, content } = await c.req.json()

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'notion' }
    })

    if (!token) return c.json({ error: 'Notion not connected' }, 401)

    const notionClient = new Client({ auth: token.accessToken })

    const response = await notionClient.pages.create({
      parent: { database_id: parentId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        }
      },
      children: content ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content
                }
              }
            ]
          }
        }
      ] : []
    })

    return c.json({
      id: response.id,
      url: response.url
    })
  } catch (error) {
    console.error('Notion error:', error)
    return c.json({ error: 'Failed to create page' }, 500)
  }
}