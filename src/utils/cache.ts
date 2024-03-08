import hashlru from 'hashlru'
import { DEFAULT_TTL, toDNSResponse } from './to-dns-response.js'
import type { Answer, DNSResponse, RecordType } from '../index.js'

interface CachedAnswer {
  expires: number
  value: Answer
}

/**
 * Time Aware Least Recent Used Cache
 *
 * @see https://arxiv.org/pdf/1801.00390
 */
export class AnswerCache {
  private readonly lru: ReturnType<typeof hashlru>

  constructor (maxSize: number) {
    this.lru = hashlru(maxSize)
  }

  get (fqdn: string, types: RecordType[]): DNSResponse | undefined {
    let foundAllAnswers = true
    const answers: Answer[] = []

    for (const type of types) {
      const cached = this.getAnswers(fqdn, type)

      if (cached.length === 0) {
        foundAllAnswers = false
        break
      }

      answers.push(...cached)
    }

    if (foundAllAnswers) {
      return toDNSResponse({ answers })
    }
  }

  private getAnswers (domain: string, type: RecordType): Answer[] {
    const key = `${domain.toLowerCase()}-${type}`
    const answers: CachedAnswer[] = this.lru.get(key)

    if (answers != null) {
      const cachedAnswers = answers
        .filter((entry) => {
          return entry.expires > Date.now()
        })
        .map(({ value }) => value)

      if (cachedAnswers.length === 0) {
        this.lru.remove(key)
      }

      return cachedAnswers
    }

    return []
  }

  add (domain: string, answer: Answer): void {
    const key = `${domain.toLowerCase()}-${answer.type}`

    const answers: CachedAnswer[] = this.lru.get(key) ?? []
    answers.push({
      expires: Date.now() + ((answer.TTL ?? DEFAULT_TTL) * 1000),
      value: answer
    })

    this.lru.set(key, answers)
  }

  remove (domain: string, type: ResponseType): void {
    const key = `${domain.toLowerCase()}-${type}`

    this.lru.remove(key)
  }

  clear (): void {
    this.lru.clear()
  }
}

/**
 * Avoid sending multiple queries for the same hostname by caching results
 */
export const cache = new AnswerCache(1000)
