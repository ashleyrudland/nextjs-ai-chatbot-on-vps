'use server'

import { readFile, writeFile, stat } from 'fs/promises'
import path from 'path'
import { Chat, User } from '@/lib/types'

const storageRoot = path.resolve(
  process.env.NODE_ENV === 'production' ? '/ai-chatbot-data/' : './'
)

const parse = (json: string) => {
  if (!json) {
    return null
  }
  try {
    return JSON.parse(json)
  } catch (error) {
    return null
  }
}

const getFileSize = async (fileName: string) => {
  try {
    const stats = await stat(path.join(storageRoot, fileName))
    return stats.size
  } catch (error) {
    return 0
  }
}

const loadJson = async (fileName: string) => {
  try {
    const json = await readFile(path.join(storageRoot, fileName), 'utf-8')
    return parse(json)
  } catch (error) {
    return null
  }
}

class KeyValueStorage {
  private groups: {
    [groupName: string]: { [partitionKey: string]: string[] }
  } = {}

  private items: {
    [id: string]: any
  } = {}

  constructor() {
    this.load()
  }

  async load() {
    const loadedGroups = await loadJson('groups.json')
    if (loadedGroups) {
      this.groups = loadedGroups
    }
    const loadedItems = await loadJson('items.json')
    if (loadedItems) {
      this.items = loadedItems
    }
  }

  async save() {
    await writeFile(
      path.join(storageRoot, 'groups.json'),
      JSON.stringify(this.groups)
    )
    await writeFile(
      path.join(storageRoot, 'items.json'),
      JSON.stringify(this.items)
    )
  }

  async getItemsByPartitionKey<T>(
    group: string,
    partitionKey: string
  ): Promise<T[]> {
    const ids = this.groups[group]?.[partitionKey] ?? []
    const records = ids.map(id => this.getItem<T>(group, id))

    return records.filter(record => !!record) as T[]
  }

  getItem<T>(group: string, id: string): T | null {
    return this.items[`${group}:${id}`]
  }

  deleteItem<T>(group: string, id: string, partitionKeyField?: keyof T) {
    const item = this.getItem<T>(group, id)

    if (item) {
      delete this.items[`${group}:${id}`]

      if (partitionKeyField) {
        const pt = item[partitionKeyField] as string
        if (this.groups[group][pt]) {
          this.groups[group][pt] = this.groups[group][pt].filter(
            (itemId: string) => itemId !== id
          )
        }
      }
    }
    this.save()
  }

  setItem<T>(
    group: string,
    id: string,
    payload: T,
    partitionKeyField?: keyof T
  ) {
    this.items[`${group}:${id}`] = payload

    if (partitionKeyField) {
      const pt = payload[partitionKeyField] as string
      if (!this.groups[group]) {
        this.groups[group] = {}
      }
      if (!this.groups[group][pt]) {
        this.groups[group][pt] = []
      }
      if (!this.groups[group][pt].includes(id)) {
        this.groups[group][pt].push(id)
      }
    }
    this.save()
  }
  deleteItemsByPartitionKey(group: string, pt: string) {
    this.groups[group][pt].forEach((id: string) => {
      this.deleteItem(group, id)
    })
    this.save()
  }

  async getStats() {
    const itemsSize = await getFileSize('items.json')
    const groupsSize = await getFileSize('groups.json')
    const dbSize = itemsSize + groupsSize

    // count all the records by group
    const records: { [group: string]: number } = {}

    Object.keys(this.items).forEach(key => {
      const group = key.split(':')[0]
      records[group] = (records[group] || 0) + 1
    })

    return {
      dbSize,
      records,
      updated: new Date().toISOString()
    }
  }
}

const kv = new KeyValueStorage()

export const getChatsByUserId = async (userId: string) =>
  kv.getItemsByPartitionKey<Chat>('chat', userId)

export const getChatById = (chatId: string) => kv.getItem<Chat>('chat', chatId)

export const deleteChatById = (chatId: string) =>
  kv.deleteItem('chat', chatId, 'userId')

export const deleteChatsByUserId = (userId: string) =>
  kv.deleteItemsByPartitionKey('chat', userId)

export const updateChat = (chatId: string, payload: Chat) =>
  kv.setItem('chat', chatId, payload, 'userId')

export const insertChat = (payload: Chat) =>
  kv.setItem('chat', payload.id, payload, 'userId')

export const insertUser = (payload: User) =>
  kv.setItem('user', payload.email, payload)

export const getUserByEmail = (email: string) => kv.getItem<User>('user', email)

export const getStats = async () => {
  const stats = await kv.getStats()
  return stats
}
