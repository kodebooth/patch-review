import {expect, describe, it} from '@jest/globals'
import * as fetch from '../src/fetch'
import * as path from 'path'
import * as os from 'os'

const workingDirectory = 'working-directory'
const httpFileUri = 'http://example.com/index.html'
const httpTarUri =
  'https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.5.8.tar.xz'
const unknownUri = 'unknown://example.com/file'

describe('fetch', () => {
  describe('construction', () => {
    it('should construct with valid uri', () => {
      expect(fetch.create(httpFileUri)).toHaveProperty('fetch')
    })

    it('should throw with unknown scheme', () => {
      expect(() => {
        fetch.create(unknownUri)
      }).toThrow(`Unknown fetcher scheme: unknown`)
    })
  })

  describe('fetching', () => {
    const dir = path.join(os.tmpdir(), workingDirectory)
    it('should fetch valid file url', async () => {
      const fetcher = fetch.create(httpFileUri)
      expect(await fetcher.fetch(dir)).toEqual(path.join(dir, 'index.html'))
    })

    it('should fetch valid tar url and extract it', async () => {
      const fetcher = fetch.create(httpTarUri)
      expect(await fetcher.fetch(dir)).toEqual(dir)
    }, 60000)
  })
})
